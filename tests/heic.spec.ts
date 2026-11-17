import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { elementCount, fakeShell, openApp, openTool, PNG_2X2, shellCalls } from "./helpers";

/** A HEIC photo made by macOS (`sips -s format heic`): left half warm red, right half blue, 64×48. */
const photo = (name = "photo.heic", mimeType = "image/heic") => ({
  name,
  mimeType,
  buffer: readFileSync(new URL("./fixtures/photo.heic", import.meta.url)),
});

const upload = async (page: Page, file: ReturnType<typeof photo>) => {
  await openTool(page, "Images");
  await page.getByLabel("Upload image to canvas").setInputFiles(file);
};

/** A pixel of the picture now on the canvas, read from its data: URL. */
const firstImage = (page: Page): Promise<{ type: string; width: number; height: number; left: number[]; right: number[] }> =>
  page.evaluate(`(async () => {
    const src = S.getState().elements[0].src;
    const image = new Image();
    image.src = src;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(image, 0, 0);
    const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
    return { type: src.slice(5, src.indexOf(";")), width: c.width, height: c.height, left: at(8, 24), right: at(56, 24) };
  })()`);

const near = (a: number[], b: number[]) => a.every((value, i) => Math.abs(value - b[i]) <= 14);

test.describe("HEIC photos", () => {
  test("in a browser that reads them, a HEIC photo comes in as a JPEG the right way round", async ({ page }) => {
    await openApp(page);
    await upload(page, photo());
    await expect.poll(() => elementCount(page)).toBe(1);
    const image = await firstImage(page);
    expect(image.type).toBe("image/jpeg");
    expect([image.width, image.height]).toEqual([64, 48]);
    expect(near(image.left, [220, 40, 40])).toBe(true);
    expect(near(image.right, [40, 80, 220])).toBe(true);
  });

  test("a browser that can't read them says what to do instead", async ({ page }) => {
    await page.addInitScript(`window.createImageBitmap = () => Promise.reject(new Error("unsupported"))`);
    const dialog = new Promise<string>((resolve) => page.once("dialog", async (d) => (resolve(d.message()), d.dismiss())));
    await openApp(page);
    await upload(page, photo());
    expect(await dialog).toMatch(/can't open HEIC photos.*desktop app/);
    expect(await elementCount(page)).toBe(0);
  });

  test("on the desktop, Rust turns it into a picture, and a nameless one is known by its bytes", async ({ page }) => {
    await fakeShell(
      page,
      `(command) => command === "convert_heic"
        ? Uint8Array.from(atob(${JSON.stringify(PNG_2X2)}), (c) => c.charCodeAt(0)).buffer
        : null`,
    );
    await openApp(page);
    await upload(page, photo());
    await expect.poll(() => elementCount(page)).toBe(1);
    const sent = (await page.evaluate(`(() => {
      const call = CALLS.find((c) => c[0] === "convert_heic");
      return call ? String.fromCharCode(...call[1].slice(4, 12)) : null;
    })()`)) as string;
    expect(sent).toBe("ftypheic");
    expect(await page.evaluate(`S.getState().elements[0].src.startsWith("data:image/png")`)).toBe(true);

    // A file with no type and no name (some systems give HEIC neither) is known by its first bytes.
    const bytes = readFileSync(new URL("./fixtures/photo.heic", import.meta.url)).toString("base64");
    expect(
      await page.evaluate(`(async () => {
        const { isHeic } = await import("/src/lib/heic.ts");
        return isHeic(new Blob([Uint8Array.from(atob("${bytes}"), (c) => c.charCodeAt(0))]));
      })()`),
    ).toBe(true);
  });

  test("on the desktop, a photo Rust can't read is explained, and nothing is added", async ({ page }) => {
    await fakeShell(
      page,
      `(command) => {
        if (command === "convert_heic") throw "Layer couldn't read this photo. It may be damaged, or a kind of HEIC Layer can't open.";
        return null;
      }`,
    );
    await openApp(page);
    await upload(page, photo());
    await expect.poll(async () => (await shellCalls(page, "show_error")).at(-1)).toEqual({
      message: "Layer couldn't read this photo. It may be damaged, or a kind of HEIC Layer can't open.",
    });
    expect(await elementCount(page)).toBe(0);
  });

  test("an AVIF, which starts much the same, isn't taken for HEIC", async ({ page }) => {
    await openApp(page);
    const result = await page.evaluate(`(async () => {
      const { isHeic } = await import("/src/lib/heic.ts");
      const head = (brands) => new Blob([new Uint8Array([0, 0, 0, 0x1c, ...new TextEncoder().encode("ftyp" + brands)])]);
      return [await isHeic(head("avif\\0\\0\\0\\0avifmif1")), await isHeic(head("mif1\\0\\0\\0\\0mif1heic")), await isHeic(head("heic\\0\\0\\0\\0mif1heic"))];
    })()`);
    expect(result).toEqual([false, true, true]);
  });
});
