import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { addTwoToneImage, elementCount, fakeShell, openApp, shellCalls } from "./helpers";

const VALID = {
  version: 1,
  canvas: { width: 1200, height: 800 },
  background: { mode: "solid", solid: "#102030" },
  elements: [],
  watermark: true,
};

const open = async (page: Page, contents: string | Buffer) => {
  const dialog = new Promise<string | null>((resolve) => {
    page.once("dialog", async (d) => {
      const message = d.message();
      await d.dismiss();
      resolve(message);
    });
    setTimeout(() => resolve(null), 1500);
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("Open project (.layer)").click();
  await (await chooser).setFiles({
    name: "test.layer",
    mimeType: "application/octet-stream",
    buffer: typeof contents === "string" ? Buffer.from(contents) : contents,
  });
  return dialog;
};

const bad: [string, string, RegExp][] = [
  ["not JSON", "this is not json", /isn't a Layer project/],
  ["an empty object", "{}", /isn't a Layer project/],
  ["a JSON array", "[]", /isn't a Layer project/],
  ["a missing canvas", JSON.stringify({ ...VALID, canvas: undefined }), /isn't a Layer project/],
  ["a zero-size canvas", JSON.stringify({ ...VALID, canvas: { width: 0, height: 800 } }), /isn't a Layer project/],
  ["elements that aren't a list", JSON.stringify({ ...VALID, elements: "nope" }), /isn't a Layer project/],
  ["an unknown element", JSON.stringify({ ...VALID, elements: [{ id: "a", type: "video" }] }), /isn't a Layer project/],
  ["a newer version", JSON.stringify({ ...VALID, version: 3 }), /newer version/],
];

for (const [name, contents, message] of bad) {
  test(`opening ${name} explains why and keeps the canvas`, async ({ page }) => {
    const errors = await openApp(page);
    await addTwoToneImage(page);
    expect(await open(page, contents)).toMatch(message);
    expect(await elementCount(page)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("a good project opens with no message", async ({ page }) => {
  const errors = await openApp(page);
  await addTwoToneImage(page);
  expect(await open(page, JSON.stringify(VALID))).toBeNull();
  expect(await elementCount(page)).toBe(0);
  expect(await page.evaluate(`S.getState().canvas.width`)).toBe(1200);
  expect(errors).toEqual([]);
});

test("a saved project opens again", async ({ page }) => {
  await openApp(page);
  await addTwoToneImage(page);
  const saved = await page.evaluate<string>(`JSON.stringify(S.getState().toProject())`);
  await page.evaluate(`S.getState().resetProject()`);
  expect(await open(page, saved)).toBeNull();
  expect(await elementCount(page)).toBe(1);
});

test("on the desktop the message goes through the shell", async ({ page }) => {
  await fakeShell(page, `(command) => command === "open_project" ? new TextEncoder().encode("not json").buffer : undefined`);
  await openApp(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("Open project (.layer)").click();
  await expect.poll(() => shellCalls(page, "show_error")).toEqual([
    { message: "This file isn't a Layer project, or it's damaged." },
  ]);
});

test("fonts load with no network and nothing asks Google", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/googleapis|gstatic/.test(request.url())) external.push(request.url());
  });
  await page.route(/googleapis|gstatic/, (route) => route.abort());
  await openApp(page);

  const loaded = await page.evaluate<string[]>(`(async () => {
    const wanted = ['500 14px "DM Sans"', '700 14px "Bricolage Grotesque"', '400 14px "JetBrains Mono"'];
    await Promise.all(wanted.map((font) => document.fonts.load(font)));
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replaceAll('"', ""));
  })()`);

  for (const family of ["DM Sans", "Bricolage Grotesque", "JetBrains Mono"]) {
    expect(loaded).toContain(family);
  }
  expect(external).toEqual([]);
});

test.describe("the .layer file", () => {
  /** Saves through the Export menu and returns the downloaded file's bytes. */
  const save = async (page: Page) => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByText("Save project (.layer)").click();
    const file = await download;
    const path = await file.path();
    const { readFileSync } = await import("node:fs");
    return { name: file.suggestedFilename(), bytes: readFileSync(path) };
  };

  test("holds each picture once, as a file in its images folder, and opens again", async ({ page }) => {
    await openApp(page);
    const id = await addTwoToneImage(page);
    // The same picture twice, and as the background.
    await page.evaluate(`(() => {
      const s = S.getState();
      const src = s.elements[0].src;
      s.duplicateElement("${id}");
      s.setBackground({ mode: "image", imageSrc: src });
    })()`);
    const before = (await page.evaluate(`S.getState().elements.map((el) => el.src)`)) as string[];

    const { name, bytes } = await save(page);
    expect(name).toMatch(/\.layer$/);
    expect(bytes.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
    const entries = unzipSync(new Uint8Array(bytes));
    const images = Object.keys(entries).filter((entry) => entry.startsWith("images/"));
    expect(images).toHaveLength(1);
    expect(images[0]).toMatch(/^images\/[0-9a-f]{64}\.png$/);
    const project = JSON.parse(strFromU8(entries["project.json"])) as {
      version: number;
      elements: { src: string }[];
      background: { imageSrc: string };
    };
    expect(project.version).toBe(2);
    expect(project.elements.map((el) => el.src)).toEqual([`layer-file:${images[0]}`, `layer-file:${images[0]}`]);
    expect(project.background.imageSrc).toBe(`layer-file:${images[0]}`);
    // Far smaller than the picture as text.
    expect(strFromU8(entries["project.json"]).includes("data:")).toBe(false);

    await page.evaluate(`S.getState().resetProject()`);
    expect(await open(page, bytes)).toBeNull();
    expect(await page.evaluate(`S.getState().elements.map((el) => el.src)`)).toEqual(before);
    expect(await page.evaluate(`S.getState().background.imageSrc`)).toBe(before[0]);
  });

  test("a zip without a project in it explains why", async ({ page }) => {
    await openApp(page);
    await addTwoToneImage(page);
    const { zipSync, strToU8 } = await import("fflate");
    const notAProject = Buffer.from(zipSync({ "readme.txt": strToU8("hello") }));
    expect(await open(page, notAProject)).toMatch(/isn't a Layer project/);
    expect(await elementCount(page)).toBe(1);
  });
});

test("fonts a project carries go in its fonts folder, and come back", async ({ page }) => {
  await openApp(page);
  const font = "data:font/woff2;base64,d09GMgABAAAAAA==";
  const result = (await page.evaluate(`(async () => {
    const file = await import("/src/lib/projectFile.ts");
    const project = { ...S.getState().toProject(), fonts: [{ family: "Acme", weight: 400, src: "${font}" }] };
    const bytes = await file.packProject(project);
    const back = await file.readProjectFile(bytes);
    return { bytes: Array.from(bytes), font: back.fonts[0].src };
  })()`)) as { bytes: number[]; font: string };
  const entries = unzipSync(new Uint8Array(result.bytes));
  expect(Object.keys(entries).filter((entry) => entry.startsWith("fonts/"))).toHaveLength(1);
  expect(result.font).toBe(font);
});
