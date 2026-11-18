import { readFileSync } from "node:fs";
import { GifReader } from "omggif";
import { expect, test, type Page } from "@playwright/test";
import { elementCount, openApp, openSection, openTool } from "./helpers";

/*
  three-frames.gif, 40×30, looping:
    0–100 ms   red all over
    100–300 ms a green square (10–30, 8–22) over the red, then cleared (disposal 2)
    300–600 ms a blue left half; after the clearing, the right half is empty
*/
const RED = [220, 40, 40];
const GREEN = [40, 180, 80];
const BLUE = [40, 80, 220];

const fixture = (name: string) => ({
  name,
  mimeType: "image/gif",
  buffer: readFileSync(new URL(`./fixtures/${name}`, import.meta.url)),
});

const near = (a: number[], b: number[], slack = 16) => b.every((value, i) => Math.abs(a[i] - value) <= slack);

/** Adds the GIF through the Images picker, at 0,0 and 400×300, and waits until it's known to play. */
const addGif = async (page: Page, name = "three-frames.gif") => {
  await openTool(page, "Images");
  await page.getByLabel("Upload image to canvas").setInputFiles(fixture(name));
  await expect.poll(() => elementCount(page)).toBe(1);
  await page.evaluate(`S.getState().updateElement(S.getState().elements[0].id, { x: 0, y: 0, width: 400, height: 300 })`);
  return (await page.evaluate(`S.getState().elements[0].id`)) as string;
};

/** A pixel of the frame the image node is showing, in the GIF's own pixels (RGBA). */
const framePixel = (page: Page, id: string, x: number, y: number): Promise<number[]> =>
  page.evaluate(`(() => {
    const canvas = ST().findOne("#${id}").findOne("Image").image();
    return Array.from(canvas.getContext("2d").getImageData(${x}, ${y}, 1, 1).data);
  })()`);

const loadPlayback = (page: Page) =>
  page.evaluate(`(async () => { window.PLAY = (await import("/src/lib/motion/playback.ts")).playback; })()`);

test.describe("animated GIFs", () => {
  test("come in from the picker, are known to play without an undo step, and turn on the play bar", async ({ page }) => {
    await openApp(page);
    await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif ?? null`)).toEqual({ frames: 3, duration: 600 });
    await expect(page.getByRole("button", { name: "Play animation" })).toBeVisible();
    // The undo steps are adding and moving it: recording that it plays isn't one.
    await page.keyboard.press("Meta+z");
    await page.keyboard.press("Meta+z");
    expect(await elementCount(page)).toBe(0);
  });

  test("show the right frame at each moment, whole, and loop", async ({ page }) => {
    await openApp(page);
    await loadPlayback(page);
    const id = await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);

    await page.evaluate(`PLAY.seek(0.05)`);
    expect(near(await framePixel(page, id, 20, 15), RED)).toBe(true);

    await page.evaluate(`PLAY.seek(0.15)`);
    expect(near(await framePixel(page, id, 20, 15), GREEN)).toBe(true);
    // Frame 2 is a patch over frame 1: the red still shows around the square.
    expect(near(await framePixel(page, id, 2, 2), RED)).toBe(true);

    await page.evaluate(`PLAY.seek(0.45)`);
    expect(near(await framePixel(page, id, 5, 15), BLUE)).toBe(true);
    // Frame 2 was cleared after it showed: none of its green, or the red, is left.
    expect((await framePixel(page, id, 25, 15))[3]).toBe(0);

    await page.evaluate(`PLAY.seek(0.65)`);
    expect(near(await framePixel(page, id, 20, 15), RED)).toBe(true);
    await page.keyboard.press("Escape");
  });

  test("a still export shows the first frame, whatever's playing", async ({ page }) => {
    await openApp(page);
    const id = await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);
    // Held on the blue frame, as if caught mid-play.
    await page.evaluate(`(async () => (await import("/src/lib/gif/player.ts")).showGifsAt(450))()`);
    expect(near(await framePixel(page, id, 5, 15), BLUE)).toBe(true);
    const pixel = await page.evaluate(`(async () => {
      const url = await X.renderCanvasDataURL("png", 1);
      const image = new Image();
      image.src = url;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const g = c.getContext("2d");
      g.drawImage(image, 0, 0);
      return Array.from(g.getImageData(50, 150, 1, 1).data);
    })()`);
    expect(near(pixel as number[], RED)).toBe(true);
  });

  test("a GIF export plays the GIF through its frames", async ({ page }) => {
    await openApp(page);
    await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);
    await page.evaluate(`S.getState().setMotion({ length: 2 })`);
    const bytes = (await page.evaluate(`(async () => {
      const ex = await import("/src/lib/motion/exportAnimation.ts");
      const blob = await ex.renderAnimation({ format: "gif", scale: 1, fps: 30, gifSize: "small" });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    })()`)) as number[];
    const reader = new GifReader(new Uint8Array(bytes));
    const pixels = new Uint8Array(reader.width * reader.height * 4);
    // The GIF is 400×300 at the top left of 2400×1350, so 80×60 in a 480-wide export.
    const seen = new Set<string>();
    for (let frame = 0; frame < reader.numFrames(); frame++) {
      reader.decodeAndBlitFrameRGBA(frame, pixels);
      const at = (10 * reader.width + 10) * 4;
      const colour = [pixels[at], pixels[at + 1], pixels[at + 2]];
      if (near(colour, RED, 30)) seen.add("red");
      if (near(colour, BLUE, 30)) seen.add("blue");
      const middle = (30 * reader.width + 40) * 4;
      if (near([pixels[middle], pixels[middle + 1], pixels[middle + 2]], GREEN, 30)) seen.add("green");
    }
    expect([...seen].sort()).toEqual(["blue", "green", "red"]);
  });

  test("play by themselves while editing, and stay on the first frame with Reduce motion", async ({ page }) => {
    await openApp(page);
    const id = await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);
    // Live: within a loop and a bit, something other than the first frame shows.
    await expect.poll(async () => near(await framePixel(page, id, 20, 15), RED), { timeout: 2000, intervals: [50] }).toBe(false);

    await page.evaluate(`S.getState().setPreferences({ reduceMotion: true })`);
    await expect.poll(async () => near(await framePixel(page, id, 20, 15), RED)).toBe(true);
    await page.waitForTimeout(700);
    expect(near(await framePixel(page, id, 20, 15), RED)).toBe(true);
  });

  test("say edits are for still pictures, and offer to match the clip to the GIF", async ({ page }) => {
    await openApp(page);
    await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);
    await page.evaluate(`S.getState().selectElement(S.getState().elements[0].id)`);
    await openSection(page, "Edit");
    await expect(page.getByText("Fix, Style and Adjust are for still pictures. This GIF plays as it is.")).toBeVisible();

    await openTool(page, "Animate");
    await page.getByRole("button", { name: "Match the GIF" }).click();
    expect(await page.evaluate(`S.getState().motion.length`)).toBe(2.4);
    await expect(page.getByText("The clip fits your GIF (0.6s)", { exact: false })).toBeVisible();

    await page.evaluate(`S.getState().selectElement(null)`);
    await openSection(page, "Animate");
    await expect(page.getByRole("complementary", { name: "Properties" }).getByText("Still · 2.4s · 1 GIF")).toBeVisible();
  });

  test("a GIF with one frame is just a picture", async ({ page }) => {
    await openApp(page);
    await addGif(page, "one-frame.gif");
    await page.waitForTimeout(500);
    expect(await page.evaluate(`S.getState().elements[0].gif ?? null`)).toBeNull();
    await expect(page.getByRole("button", { name: "Play animation" })).toHaveCount(0);
  });

  test("keep playing after a project is saved and opened again", async ({ page }) => {
    await openApp(page);
    await loadPlayback(page);
    await addGif(page);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);
    await page.evaluate(`(async () => {
      const file = await import("/src/lib/projectFile.ts");
      const bytes = await file.packProject(S.getState().toProject());
      const project = await file.readProjectFile(bytes);
      // As if from before GIFs were measured: it's found out again.
      delete project.elements[0].gif;
      S.getState().resetProject();
      S.getState().loadProject(project);
    })()`);
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif ?? null`)).toEqual({ frames: 3, duration: 600 });
    const id = (await page.evaluate(`S.getState().elements[0].id`)) as string;
    await page.evaluate(`PLAY.seek(0.45)`);
    await expect.poll(async () => near(await framePixel(page, id, 5, 15), BLUE)).toBe(true);
  });
});
