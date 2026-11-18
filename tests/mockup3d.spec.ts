import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import rawFrames from "../src/data/deviceFrames.json" with { type: "json" };
import { addTwoToneImage, elementCount, expectNear, openApp, openSection, openTool } from "./helpers";

/*
  3D mockups: a phone, tablet or laptop turns as a solid, drawn by three.js; any other
  mockup turns as a flat card. Positions are checked against the same maths the
  renderer uses (bodies.ts), so a test finds the screen wherever the turn put it.
*/

const GREEN = [29, 158, 117];
const GREY = [200, 200, 200];

const frameOn = (page: Page, id: string, device: string, finish: string, extra: Record<string, unknown> = {}) =>
  page.evaluate(`(async () => {
    const M = await import("/src/lib/mockups.ts");
    const s = S.getState();
    const el = s.elements.find((e) => e.id === ${JSON.stringify(id)});
    const device = M.DEVICES.find((d) => d.id === ${JSON.stringify(device)});
    s.setDeviceFrame(el.id, { ...M.newFrame(device, M.pictureRatioOf(el)), finish: ${JSON.stringify(finish)}, landscape: false, ...${JSON.stringify(extra)} });
  })()`);

const tiltTo = (page: Page, id: string, tiltX: number, tiltY: number, tiltZ = 0) =>
  page.evaluate(`(async () => {
    const T = await import("/src/lib/tilt.ts");
    S.getState().updateElement(${JSON.stringify(id)}, {
      transform: T.serializeImageTilt({ ...T.DEFAULT_IMAGE_TILT, tiltX: ${tiltX}, tiltY: ${tiltY}, tiltZ: ${tiltZ} }),
    });
  })()`);

const turnedShows = (page: Page, id: string) =>
  page.evaluate<boolean>(`!!ST().findOne("#${id}")?.findOne(".turned-mockup")?.isVisible()`);

const flatShows = (page: Page, id: string) =>
  page.evaluate<boolean>(`!!ST().findOne("#${id}")?.findOne(".mockup-flat")?.isVisible()`);

/** A fingerprint of the turned drawing, to tell when it's drawn again differently. */
const turnedPrint = (page: Page, id: string) =>
  page.evaluate<number>(`(() => {
    const source = ST().findOne("#${id}").findOne(".turned-mockup").image();
    const small = document.createElement("canvas");
    small.width = 24;
    small.height = 24;
    const g = small.getContext("2d");
    g.drawImage(source, 0, 0, 24, 24);
    return Array.from(g.getImageData(0, 0, 24, 24).data).reduce((sum, value, i) => sum + value * ((i % 97) + 1), 0);
  })()`);

/**
 * Where points of a solid device's front land once turned, in canvas pixels. Given as
 * fractions of the image's box. The image isn't rotated.
 */
const landed = (page: Page, id: string, points: [number, number][]) =>
  page.evaluate<[number, number][]>(`(async () => {
    const M = await import("/src/lib/mockups.ts");
    const B = await import("/src/lib/devices3d/bodies.ts");
    const TR = await import("/src/lib/tiltRender.ts");
    const T = await import("/src/lib/tilt.ts");
    const el = S.getState().elements.find((e) => e.id === ${JSON.stringify(id)});
    const tilt = T.parseImageTilt(el.transform);
    const model = B.solidModel(M.solidOf(el));
    const view = B.solidViewOf(model, tilt, el.width, el.height);
    const turn = B.solidTiltOf(model, tilt);
    return ${JSON.stringify(points)}.map(([u, v]) => {
      const p = TR.projectPoint(B.placePoint(view, turn, el.width, el.height, [u * el.width, v * el.height, 0]), view.distance, el.width, el.height);
      return [el.x + p.x, el.y + p.y];
    });
  })()`);

/** Pixels of a still export without its background, at the canvas's own size. */
const exportPixels = (page: Page, points: [number, number][]) =>
  page.evaluate<number[][]>(`(async () => {
    const url = await X.renderCanvasDataURL("png", 1, { withoutBackground: true });
    const image = new Image();
    image.src = url;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const g = c.getContext("2d");
    g.drawImage(image, 0, 0);
    return ${JSON.stringify(points)}.map(([x, y]) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data));
  })()`);

const IPHONE_17 = rawFrames.devices.find((device) => device.id === "iphone-17")!;
const MACBOOK_PRO = rawFrames.devices.find((device) => device.id === "macbook-pro")!;

test.describe("3D mockups", () => {
  test("a phone turns as a solid from the 3D section, which no longer says mockups stay flat", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "iphone-17", "black");
    await openSection(page, "3D");
    const properties = page.getByRole("complementary", { name: "Properties" });
    await expect(properties.getByText("A mockup stays flat", { exact: false })).toHaveCount(0);
    // A solid is lit, which shades its far side already.
    await expect(properties.getByText("INNER SHADE")).toHaveCount(0);

    await properties.getByRole("button", { name: "Iso Left" }).click();
    await expect.poll(() => turnedShows(page, id)).toBe(true);
    expect(await flatShows(page, id)).toBe(false);
    expect(errors).toEqual([]);
  });

  test("has depth: its side shows past the front's edge, in the finish's colour", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "iphone-17", "black");
    // Turned to the right, so its left side comes into view.
    await tiltTo(page, id, 0, 30);
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    const bodyLeft = IPHONE_17.body!.x;
    const [[x, y]] = await landed(page, id, [[bodyLeft, 0.6]]);
    const [side, beyond] = await exportPixels(page, [
      [x - 5, y],
      [x - 200, y],
    ]);
    expect(side[3]).toBeGreaterThan(200);
    // A dark grey, lit: the black finish's metal, not the picture.
    expect(Math.max(side[0], side[1], side[2]) - Math.min(side[0], side[1], side[2])).toBeLessThan(30);
    expect(beyond[3]).toBe(0);
    expect(errors).toEqual([]);
  });

  test("shows the picture on its screen, the right way round", async ({ page }) => {
    const errors = await openApp(page);
    // Green on the left, grey on the right; the screen shows the middle of it.
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "iphone-17", "black");
    await tiltTo(page, id, 10, 20);
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    const [left, right] = await exportPixels(page, await landed(page, id, [[0.38, 0.5], [0.62, 0.5]]));
    expectNear(left.slice(0, 3), GREEN, 30);
    expectNear(right.slice(0, 3), GREY, 30);
    expect(errors).toEqual([]);
  });

  test("turns exactly as a tilted picture does, and rests where the flat mockup is", async ({ page }) => {
    await openApp(page);
    const gaps = await page.evaluate<{ thin: number; atRest: number }>(`(async () => {
      const B = await import("/src/lib/devices3d/bodies.ts");
      const TR = await import("/src/lib/tiltRender.ts");
      const T = await import("/src/lib/tilt.ts");
      const width = 400;
      const height = 800;
      const shape = { kind: "slab", device: "test", group: "Phones", body: { x: 0, y: 0, width, height }, corners: [40, 40, 40, 40], buttons: [], across: width, color: "#000000" };
      const model = B.solidModel(shape);
      const corners = [[0, 0], [width, 0], [0, height], [width, height]];
      const front = (m, tilt) => {
        const view = B.solidViewOf(m, tilt, width, height);
        return corners.map(([x, y]) => TR.projectPoint(B.placePoint(view, B.solidTiltOf(m, tilt), width, height, [x, y, 0]), view.distance, width, height));
      };
      const gap = (a, b) => Math.max(...a.map((p, i) => Math.max(Math.abs(p.x - b[i].x), Math.abs(p.y - b[i].y))));

      // With no depth, its front is a tilted picture's.
      const tilt = { ...T.DEFAULT_IMAGE_TILT, tiltX: 20, tiltY: -30, tiltZ: 10, scale: 1.1 };
      const thin = gap(front({ ...model, body: { ...model.body, depth: 0 } }, tilt), TR.tiltCorners({ tilt, width, height, cornerRadius: 0 }));

      // With depth, untilted, its front is where the flat mockup is.
      const flat = { ...T.DEFAULT_IMAGE_TILT, tiltZ: 0 };
      const atRest = gap(front(model, flat), corners.map(([x, y]) => ({ x, y })));
      return { thin, atRest };
    })()`);
    expect(gaps.thin).toBeLessThan(0.5);
    expect(gaps.atRest).toBeLessThan(0.5);
  });

  test("a laptop is seen from above, its keyboard deck below the lid", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "macbook-pro", "silver");
    await tiltTo(page, id, 30, 0);
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    const lidBottom = MACBOOK_PRO.body!.y + MACBOOK_PRO.body!.height;
    const height = (await page.evaluate(`S.getState().elements.find((e) => e.id === ${JSON.stringify(id)}).height`)) as number;
    const [[x, y]] = await landed(page, id, [[0.5, lidBottom]]);
    // Below the lid, where the flat mockup shows only its picture: dark keys on light metal.
    const below = await exportPixels(
      page,
      Array.from({ length: 40 }, (_, i): [number, number] => [x, y + 4 + (i / 40) * height * 0.35]),
    );
    const luma = (p: number[]) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    expect(below.every((p) => p[3] > 200)).toBe(true);
    // The picture is green and light grey: its darkest is far lighter than a key.
    expect(below.some((p) => luma(p) < 110)).toBe(true);
    expect(below.some((p) => luma(p) > 170)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("a window turns as a flat card, with its own outline", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "chrome", "light");
    await openSection(page, "3D");
    const properties = page.getByRole("complementary", { name: "Properties" });
    // A flat card isn't lit, so it keeps the shade switch.
    await expect(properties.getByText("INNER SHADE")).toHaveCount(1);
    await properties.getByRole("button", { name: "Iso Left" }).click();
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    const corners = await page.evaluate<number[]>(`(() => {
      const canvas = ST().findOne("#${id}").findOne(".turned-mockup").image();
      const g = canvas.getContext("2d");
      return [
        g.getImageData(0, 0, 1, 1).data[3],
        g.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3],
      ];
    })()`);
    expect(corners).toEqual([0, 255]);
    expect(errors).toEqual([]);
  });

  test("crops flat, then turns again; and redraws when its colour, fit or zoom change", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "iphone-17", "black");
    await tiltTo(page, id, 15, 25);
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    await page.getByRole("button", { name: "Crop", exact: true }).click();
    await expect.poll(() => turnedShows(page, id)).toBe(false);
    await page.getByRole("button", { name: "Apply crop" }).click();
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    const changeFrame = (patch: Record<string, unknown>) =>
      page.evaluate(`(() => {
        const s = S.getState();
        const el = s.elements.find((e) => e.id === ${JSON.stringify(id)});
        s.setDeviceFrame(el.id, { ...el.deviceFrame, ...${JSON.stringify(patch)} });
      })()`);
    for (const patch of [{ finish: "white" }, { fit: "fit", barColor: "#FF0000" }, { zoom: 2 }]) {
      await expect.poll(() => turnedShows(page, id)).toBe(true);
      const before = await turnedPrint(page, id);
      await changeFrame(patch);
      // While it's being drawn again it shows flat, which doesn't count as drawn.
      await expect.poll(async () => ((await turnedShows(page, id)) ? await turnedPrint(page, id) : before)).not.toBe(before);
    }
    expect(errors).toEqual([]);
  });

  test("an export straight after turning waits for the solid", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await frameOn(page, id, "iphone-17", "black");
    await page.waitForFunction(`!!ST().findOne("#${id}").findOne(".mockup-frame")`);
    // three.js isn't loaded yet in this page: the turn and the export come together.
    await page.evaluate(`(async () => {
      const T = await import("/src/lib/tilt.ts");
      S.getState().updateElement(${JSON.stringify(id)}, {
        transform: T.serializeImageTilt({ ...T.DEFAULT_IMAGE_TILT, tiltY: 30 }),
      });
      window.__exported = await X.renderCanvasDataURL("png", 1, { withoutBackground: true });
    })()`);
    const [[x, y]] = await landed(page, id, [[IPHONE_17.body!.x, 0.6]]);
    const side = await page.evaluate<number>(`(async () => {
      const image = new Image();
      image.src = window.__exported;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const g = c.getContext("2d");
      g.drawImage(image, 0, 0);
      return g.getImageData(${Math.round(x - 5)}, ${Math.round(y)}, 1, 1).data[3];
    })()`);
    expect(side).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });

  test("an animated GIF keeps playing on a turned phone", async ({ page }) => {
    const errors = await openApp(page);
    await openTool(page, "Images");
    await page.getByLabel("Upload image to canvas").setInputFiles({
      name: "three-frames.gif",
      mimeType: "image/gif",
      buffer: readFileSync(new URL("./fixtures/three-frames.gif", import.meta.url)),
    });
    await expect.poll(() => elementCount(page)).toBe(1);
    const id = (await page.evaluate(`S.getState().elements[0].id`)) as string;
    await expect.poll(() => page.evaluate(`S.getState().elements[0].gif?.frames ?? 0`)).toBe(3);
    await frameOn(page, id, "iphone-17", "black");
    await tiltTo(page, id, 10, 20);
    await expect.poll(() => turnedShows(page, id)).toBe(true);

    const seen = new Set<number>();
    await expect
      .poll(async () => {
        seen.add(await turnedPrint(page, id));
        return seen.size;
      })
      .toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
});

test("every phone, tablet and laptop has a measured body, with its screen inside", () => {
  const solids = rawFrames.devices.filter((device) => "solid" in device && device.solid);
  const ids = solids.map((device) => device.id);
  for (const device of rawFrames.devices) {
    const laptop = ["macbook-pro", "macbook", "laptop", "surface-book"].includes(device.id);
    const expected = device.group === "Phones" || device.group === "Tablets" || laptop;
    expect(ids.includes(device.id), device.id).toBe(expected);
  }
  for (const device of solids) {
    const { body, screen } = device as typeof device & {
      body: { x: number; y: number; width: number; height: number; corners: number[] };
    };
    expect(body.x).toBeGreaterThanOrEqual(0);
    expect(body.y).toBeGreaterThanOrEqual(0);
    expect(body.x + body.width).toBeLessThanOrEqual(1.0001);
    expect(body.y + body.height).toBeLessThanOrEqual(1.0001);
    expect(screen.x).toBeGreaterThanOrEqual(body.x);
    expect(screen.y).toBeGreaterThanOrEqual(body.y);
    expect(screen.x + screen.width).toBeLessThanOrEqual(body.x + body.width + 0.001);
    expect(screen.y + screen.height).toBeLessThanOrEqual(body.y + body.height + 0.001);
    expect(body.corners).toHaveLength(4);
    if (device.solid === "laptop") expect("base" in device && device.base, device.id).toBeTruthy();
    for (const finish of device.finishes) {
      expect("color" in finish && finish.color, `${device.id} ${finish.id}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  }
});
