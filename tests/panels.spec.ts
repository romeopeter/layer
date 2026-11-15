import { expect, test } from "@playwright/test";
import { addTwoToneImage, openApp, openSection, solidPng } from "./helpers";

test.describe("Position", () => {
  test("arrows send the layer to each place, and show where it is", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await openSection(page, "Position & size");
    const canvas: { width: number; height: number } = await page.evaluate(`S.getState().canvas`);

    for (const [label, h, v] of [
      ["Bottom right", 1, 1],
      ["Top left", 0, 0],
      ["Center", 0.5, 0.5],
    ] as const) {
      const place = page.getByRole("button", { name: label, exact: true });
      await place.click();
      const el: { x: number; y: number; width: number; height: number } = await page.evaluate(
        `S.getState().elements.find((e) => e.id === ${JSON.stringify(id)})`,
      );
      expect(el.x).toBeCloseTo((canvas.width - el.width) * h, 3);
      expect(el.y).toBeCloseTo((canvas.height - el.height) * v, 3);
      await expect(place).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.getByRole("button", { name: "Top left", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("LOCK ASPECT")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("3D", () => {
  test("a tilt shows when not selected, and exports the same as it shows", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    await page.evaluate(
      `S.getState().updateElement(${JSON.stringify(id)}, { transform: "rotateX(25deg) rotateY(-25deg) rotateZ(0deg) perspective(800px) scale(1) innerShadow(true)" })`,
    );
    await page.evaluate(`S.getState().selectElement(null)`);
    await page.waitForTimeout(300);
    expect(await page.evaluate(`!!ST().findOne(".tilted-picture")`)).toBe(true);

    // The image's own top-left corner is left behind by the tilt, in the export too.
    const corner: { exported: number[]; middle: number[] } = await page.evaluate(`(async () => {
      const url = await X.renderCanvasDataURL("png", 1);
      const image = new Image(); image.src = url; await image.decode();
      const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
      const g = c.getContext("2d"); g.drawImage(image, 0, 0);
      const el = S.getState().elements[0];
      const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
      return { exported: at(el.x + 6, el.y + 6), middle: at(el.x + el.width * 0.25, el.y + el.height / 2) };
    })()`);
    // Not the picture's green at the box's corner, but still green inside.
    expect(corner.exported[1]).toBeLessThan(120);
    expect(corner.middle[1]).toBeGreaterThan(120);
    expect(errors).toEqual([]);
  });
});

test.describe("Corner", () => {
  test("corners follow the image's size, and a border is on when it has a width", async ({ page }) => {
    const errors = await openApp(page);
    const id = await addTwoToneImage(page);
    // Open by default for an image, in Properties.
    await expect(page.getByRole("button", { name: "Appearance", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("ENABLE BORDER")).toHaveCount(0);

    await page.getByRole("button", { name: "Full corners" }).click();
    const el = () =>
      page.evaluate<{ cornerRadius: number; height: number; border?: { enabled: boolean; width: number } }>(
        `S.getState().elements.find((e) => e.id === ${JSON.stringify(id)})`,
      );
    // Half the shorter side: the short ends are fully round.
    expect((await el()).cornerRadius).toBe((await el()).height / 2);
    await expect(page.getByRole("button", { name: "Full corners" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Medium border" }).click();
    expect((await el()).border).toMatchObject({ enabled: true, width: 6 });
    await page.getByRole("button", { name: "No border" }).click();
    expect((await el()).border).toMatchObject({ enabled: false, width: 0 });
    expect(errors).toEqual([]);
  });
});

test.describe("Watermark", () => {
  const badgeBox = (page: import("@playwright/test").Page) =>
    page.evaluate<{ x: number; y: number; width: number; height: number; visible: boolean } | null>(`(() => {
      const node = ST().findOne(".layer-badge");
      if (!node) return null;
      const box = node.getClientRect({ relativeTo: node.getLayer() });
      return { ...box, visible: node.isVisible() };
    })()`);

  test("the badge is on by default, and can be moved", async ({ page }) => {
    const errors = await openApp(page, "Watermark");
    const canvas: { width: number; height: number } = await page.evaluate(`S.getState().canvas`);
    let box = await badgeBox(page);
    expect(box?.x).toBeGreaterThan(canvas.width / 2);
    expect(box?.y).toBeGreaterThan(canvas.height / 2);

    await page.getByRole("button", { name: "Badge: Top left" }).click();
    box = await badgeBox(page);
    expect(box?.x).toBeLessThan(canvas.width / 4);
    expect(box?.y).toBeLessThan(canvas.height / 4);
    await expect(page.getByRole("button", { name: "Badge: Top left" })).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("the badge can be resized and hidden, with no plan needed", async ({ page }) => {
    await openApp(page, "Watermark");
    await expect(page.getByText(/\bPRO\b/)).toHaveCount(0);
    const before = await badgeBox(page);
    await page.evaluate(`S.getState().setBadge({ size: 2 })`);
    expect((await badgeBox(page))?.height).toBeCloseTo((before?.height ?? 0) * 2, 0);
    await page.getByText("SHOW BADGE").click();
    expect(await badgeBox(page)).toBeNull();

    // A file that says it's off opens with it off.
    await page.evaluate(`(() => {
      const s = S.getState();
      s.setBadge({ show: true });
      const project = JSON.parse(JSON.stringify(s.toProject()));
      project.watermark.badge.show = false;
      s.loadProject(project);
    })()`);
    expect(await badgeBox(page)).toBeNull();
  });

  test("your own text goes on, out of the badge's way, and into the export", async ({ page }) => {
    const errors = await openApp(page, "Watermark");
    await page.getByRole("radio", { name: "Text", exact: true }).click();
    await page.getByRole("textbox", { name: "Watermark text" }).fill("@romeo");
    await page.getByRole("button", { name: "Watermark: Bottom right" }).click();

    const boxes: { own: { y: number; height: number }; badge: { y: number } } = await page.evaluate(`(() => {
      const own = ST().findOne(".own-watermark");
      const badge = ST().findOne(".layer-badge");
      return { own: own.getClientRect({ relativeTo: own.getLayer() }), badge: badge.getClientRect({ relativeTo: badge.getLayer() }) };
    })()`);
    // Stacked above the badge rather than over it.
    expect(boxes.own.y + boxes.own.height).toBeLessThanOrEqual(boxes.badge.y);

    // The export changes with the text on and off: it's artwork, not editor chrome.
    const exported: boolean = await page.evaluate(`(async () => {
      const withText = await X.renderCanvasDataURL("png", 1);
      S.getState().setOwnWatermark({ kind: "none" });
      await new Promise((r) => setTimeout(r, 100));
      const without = await X.renderCanvasDataURL("png", 1);
      return withText !== without;
    })()`);
    expect(exported).toBe(true);
    expect(errors).toEqual([]);
  });

  test("a logo, repeated across the canvas", async ({ page }) => {
    const errors = await openApp(page, "Watermark");
    await page.getByRole("radio", { name: "Logo", exact: true }).click();
    await page.getByLabel("Upload a logo for the watermark").setInputFiles(solidPng());
    await expect(page.getByRole("img", { name: "Your logo" })).toBeVisible();
    await expect.poll(() => page.evaluate(`ST().findOne(".own-watermark")?.find("Image").length ?? 0`)).toBe(1);

    await page.getByText("REPEAT").click();
    await expect.poll(() => page.evaluate(`ST().findOne(".own-watermark").find("Image").length`)).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });

  test("files from before watermark settings still open", async ({ page }) => {
    await openApp(page);
    const settings = await page.evaluate(`(() => {
      const s = S.getState();
      const project = JSON.parse(JSON.stringify(s.toProject()));
      project.watermark = true;
      s.loadProject(project);
      return S.getState().watermark;
    })()`);
    expect(settings).toMatchObject({ badge: { show: true, place: "bottom-right" }, own: { kind: "none" } });
  });
});

test.describe("Export menu", () => {
  const openMenu = async (page: import("@playwright/test").Page) => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByText("EXPORT OPTIONS")).toBeVisible();
  };

  test("has no Pro locks, and Remove watermark hides the badge", async ({ page }) => {
    await openApp(page);
    await openMenu(page);
    await expect(page.getByText(/\bPRO\b/)).toHaveCount(0);
    await page.getByLabel("Remove watermark").check();
    expect(await page.evaluate(`S.getState().watermark.badge.show`)).toBe(false);
  });

  test("Remove background makes a see-through PNG, and leaves the canvas alone", async ({ page }) => {
    await openApp(page);
    const corner: { alpha: number; layerVisible: boolean } = await page.evaluate(`(async () => {
      const url = await X.renderCanvasDataURL("png", 1, { withoutBackground: true });
      const image = new Image(); image.src = url; await image.decode();
      const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
      const g = c.getContext("2d"); g.drawImage(image, 0, 0);
      return { alpha: g.getImageData(10, 10, 1, 1).data[3], layerVisible: ST().findOne(".background").isVisible() };
    })()`);
    expect(corner).toEqual({ alpha: 0, layerVisible: true });

    await openMenu(page);
    await page.getByLabel("Remove background").check();
    await expect(page.getByRole("button", { name: "Download JPG" })).toBeDisabled();
    await expect(page.getByText("PNG and WebP keep it see-through. JPG can't.")).toBeVisible();
  });
});
