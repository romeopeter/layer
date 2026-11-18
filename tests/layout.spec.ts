import { expect, test, type Page } from "@playwright/test";
import { dragBy, element, elementCount, handle, openApp, openSection, solidPng, toScreen } from "./helpers";

interface Img {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  crop?: { x: number; y: number; width: number; height: number };
  layoutCrop?: { x: number; y: number; width: number; height: number };
  shadow?: unknown;
  cornerRadius?: number;
}

/** Adds real images of the given sizes, each a different flat colour. */
const addImages = (page: Page, sizes: [number, number, string][]) =>
  page.evaluate<string[]>(`(async () => {
    const ids = [];
    for (const [w, h, color] of ${JSON.stringify(sizes)}) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      ids.push(S.getState().addImage(c.toDataURL(), w, h));
    }
    await new Promise((r) => setTimeout(r, 300));
    return ids;
  })()`);

const pick = async (page: Page, label: string) => {
  // In the left panel: Properties has its own options with the same names.
  await page.getByRole("complementary", { name: "Panel" }).getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(120);
};
const images = (page: Page) =>
  page.evaluate<Img[]>(`S.getState().elements.filter((e) => e.type === "image")`);
const slots = (page: Page) =>
  page.evaluate<{ id: string | null }[]>(`S.getState().layout?.slots ?? []`);
const canvasSize = (page: Page) => page.evaluate<{ width: number; height: number }>(`S.getState().canvas`);
const overlapArea = (a: Img, b: Img) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test.describe("picking a layout", () => {
  test("every layout is on offer and places what it says", async ({ page }) => {
    const errors = await openApp(page, "Layout");
    const ids = await addImages(page, [
      [800, 600, "#a33"], [800, 600, "#3a3"], [800, 600, "#33a"], [800, 600, "#aa3"],
      [800, 600, "#3aa"], [800, 600, "#a3a"], [800, 600, "#777"], [800, 600, "#999"], [800, 600, "#222"],
    ]);
    expect(ids).toHaveLength(9);
    const size = await canvasSize(page);

    const expected: [string, number][] = [
      ["Side by side", 2], ["Stacked", 2], ["Overlap up", 2], ["Overlap down", 2], ["Masonry", 4],
      ["Do & don't", 2], ["Before & after", 2], ["Arrow between", 2], ["Three in a row", 3],
      ["One big, two small", 3], ["2×2 grid", 4], ["3×3 grid", 9], ["Cascade", 3], ["Fan", 3],
    ];
    for (const [label, count] of expected) {
      await pick(page, label);
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
      const taken = (await slots(page)).filter((s) => s.id);
      expect(taken, label).toHaveLength(count);

      const placed = (await images(page)).filter((img) => taken.some((s) => s.id === img.id));
      for (const img of placed) {
        expect(img.x + img.width / 2, `${label} on canvas`).toBeGreaterThan(0);
        expect(img.x + img.width / 2, `${label} on canvas`).toBeLessThan(size.width);
        expect(img.y + img.height / 2, `${label} on canvas`).toBeGreaterThan(0);
        expect(img.y + img.height / 2, `${label} on canvas`).toBeLessThan(size.height);
      }
    }
    expect(errors).toEqual([]);
  });

  test("side by side sits apart on a line; stacked on top of each other", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);

    await pick(page, "Side by side");
    let [a, b] = await images(page);
    expect(b.x).toBeGreaterThan(a.x + a.width - 0.5);
    expect(b.y).toBeCloseTo(a.y, 0);
    const size = await canvasSize(page);
    expect((a.x + b.x + b.width) / 2).toBeCloseTo(size.width / 2, 0);

    await pick(page, "Stacked");
    [a, b] = await images(page);
    expect(b.y).toBeGreaterThan(a.y + a.height - 0.5);
    expect(a.x + a.width / 2).toBeCloseTo(size.width / 2, 0);
  });

  test("overlaps overlap in the right direction, with the later image in front", async ({ page }) => {
    await openApp(page, "Layout");
    const [first, second] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);

    await pick(page, "Overlap up");
    let [a, b] = await images(page);
    expect(overlapArea(a, b)).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeLessThan(a.y);

    await pick(page, "Overlap down");
    [a, b] = await images(page);
    expect(b.y).toBeGreaterThan(a.y);
    expect(a.id).toBe(first);
    expect(b.id).toBe(second);
  });

  test("fan rotates around each image's middle, and leaving keeps the look", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"], [800, 600, "#33a"]]);
    await pick(page, "Fan");
    const [left, middle, right] = await images(page);
    expect(left.rotation).toBe(-9);
    expect(middle.rotation).toBe(0);
    expect(right.rotation).toBe(9);

    await pick(page, "Side by side");
    expect((await images(page)).slice(0, 2).every((img) => img.rotation === 0)).toBe(true);
  });

  test("None frees the images where they are, looking the same", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[1000, 500, "#a33"], [500, 1000, "#33a"], [800, 800, "#3a3"], [800, 800, "#aa3"]]);
    await pick(page, "2×2 grid");
    const before = await images(page);
    expect(before[0].layoutCrop).toBeTruthy();

    await pick(page, "None");
    const after = await images(page);
    expect(await slots(page)).toEqual([]);
    expect(after[0].x).toBeCloseTo(before[0].x, 3);
    expect(after[0].width).toBeCloseTo(before[0].width, 3);
    expect(after[0].layoutCrop).toBeUndefined();
    // The trim became its own crop, which Crop can reach back out of.
    expect(after[0].crop?.width).toBeCloseTo(before[0].layoutCrop?.width ?? 0, 3);

    // And it's free to move again.
    const draggable = await page.evaluate<boolean>(`ST().findOne("#" + ${JSON.stringify(after[0].id)}).draggable()`);
    expect(draggable).toBe(true);
  });

  test("extra images stay put and marks aren't moved", async ({ page }) => {
    await openApp(page, "Layout");
    const ids = await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"], [800, 600, "#33a"]]);
    const mark = await page.evaluate<string>(`S.getState().addShape("rect", { x: 11, y: 22, width: 100, height: 50 })`);
    const extraBefore = await element<Img>(page, ids[2]);

    await pick(page, "Side by side");

    const extra = await element<Img>(page, ids[2]);
    expect(extra.x).toBe(extraBefore.x);
    expect((await element<Img>(page, mark)).x).toBe(11);
  });
});

test.describe("settings", () => {
  test("spacing is the gap, and it grows", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    const gapAt = async (spacing: number) => {
      await page.evaluate(`S.getState().updateLayout({ spacing: ${spacing} })`);
      const [a, b] = await images(page);
      return b.x - (a.x + a.width);
    };
    expect(await gapAt(0)).toBeCloseTo(0, 1);
    const small = await gapAt(30);
    const big = await gapAt(100);
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  test("scale changes how much of the canvas it fills", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateLayout({ scale: 100 })`);
    const big = (await images(page))[0].width;
    await page.evaluate(`S.getState().updateLayout({ scale: 40 })`);
    expect((await images(page))[0].width).toBeLessThan(big);
  });

  test("align moves shorter images along the other axis", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 800, "#a33"], [800, 300, "#33a"]]);
    await pick(page, "Side by side");
    const shortTop = async (align: string) => {
      await page.getByRole("radio", { name: align, exact: true }).click();
      await page.waitForTimeout(60);
      const [tall, short] = await images(page);
      return { tall, short };
    };
    const start = await shortTop("Start");
    const end = await shortTop("End");
    expect(start.short.y).toBeLessThan(end.short.y);
    const middle = await shortTop("Center");
    expect(middle.short.y).toBeGreaterThan(start.short.y);
    expect(middle.short.y).toBeLessThan(end.short.y);
  });

  test("same width matches widths; turning it off lets them differ", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[1600, 600, "#a33"], [400, 800, "#33a"]]);
    await pick(page, "Side by side");
    let [a, b] = await images(page);
    expect(a.width).toBeCloseTo(b.width, 1);

    await page.evaluate(`S.getState().updateLayout({ sameWidth: false })`);
    [a, b] = await images(page);
    expect(a.width).toBeGreaterThan(b.width + 1);
    expect(a.width / a.height).toBeCloseTo(1600 / 600, 1);
    expect(b.width / b.height).toBeCloseTo(0.5, 1);
  });

  test("same shape trims without touching the user's crop, and undoes cleanly", async ({ page }) => {
    await openApp(page, "Layout");
    const [id] = await addImages(page, [[1600, 600, "#a33"], [400, 800, "#33a"]]);
    await page.evaluate(`S.getState().updateElement(${JSON.stringify(id)}, { crop: { x: 0.1, y: 0, width: 0.8, height: 1 }, width: 800, height: 375 })`);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateLayout({ sameShape: true })`);

    const [trimmed, other] = await images(page);
    expect(trimmed.width / trimmed.height).toBeCloseTo(other.width / other.height, 2);
    expect(trimmed.crop).toEqual({ x: 0.1, y: 0, width: 0.8, height: 1 });
    expect(trimmed.layoutCrop).toBeTruthy();

    await page.evaluate(`S.getState().updateLayout({ sameShape: false })`);
    const [a] = await images(page);
    expect(a.layoutCrop).toBeUndefined();
    expect(a.crop).toEqual({ x: 0.1, y: 0, width: 0.8, height: 1 });
    expect(a.width / a.height).toBeCloseTo((1600 * 0.8) / 600, 1);
  });
});

test.describe("filling slots", () => {
  test("an empty slot on the canvas opens a picker and takes the file", async ({ page }) => {
    const errors = await openApp(page, "Layout");
    await pick(page, "Side by side");
    expect((await slots(page)).every((s) => !s.id)).toBe(true);
    await expect(page.getByText("0 of 2 filled.", { exact: false })).toBeVisible();

    const placeholder = await page.evaluate<{ x: number; y: number }>(`(() => {
      const g = ST().find(".layout-empty-slot")[1];
      const r = g.getClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    const box = await page.locator(".canvas-artboard canvas").first().boundingBox();
    const chooser = page.waitForEvent("filechooser");
    await page.mouse.click((box?.x ?? 0) + placeholder.x, (box?.y ?? 0) + placeholder.y);
    await (await chooser).setFiles(solidPng());
    await expect.poll(async () => (await slots(page))[1]?.id).toBeTruthy();
    expect((await slots(page))[0].id).toBeNull();
    expect(errors).toEqual([]);
  });

  test("several files at once fill the slots in order, extras stay free", async ({ page }) => {
    await openApp(page, "Layout");
    await pick(page, "Side by side");
    const file = solidPng();
    await page.setInputFiles('input[aria-label="Add images to layout"]', [
      { ...file, name: "a.png" },
      { ...file, name: "b.png" },
      { ...file, name: "c.png" },
    ]);
    await expect.poll(() => elementCount(page)).toBe(3);
    expect((await slots(page)).every((s) => s.id)).toBe(true);
  });

  test("images added any other way take the next free slot", async ({ page }) => {
    await openApp(page, "Layout");
    await pick(page, "Stacked");
    const [id] = await addImages(page, [[800, 600, "#a33"]]);
    expect((await slots(page))[0].id).toBe(id);
  });

  test("dropping a file on a slot fills it, and on a full slot replaces it", async ({ page }) => {
    await openApp(page, "Layout");
    const [first, second] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    const target = await element<Img>(page, second);
    const at = await toScreen(page, target.x + target.width / 2, target.y + target.height / 2);

    await page.evaluate(`(async ([x, y]) => {
      const blob = await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAOBQEBa0sVlQAAAABJRU5ErkJggg==").then((r) => r.blob());
      const data = new DataTransfer();
      data.items.add(new File([blob], "drop.png", { type: "image/png" }));
      const app = document.querySelector(".canvas-artboard");
      app.dispatchEvent(new DragEvent("drop", { bubbles: true, clientX: x, clientY: y, dataTransfer: data }));
      await new Promise((r) => setTimeout(r, 300));
    })([${at.x}, ${at.y}])`);

    const after = await slots(page);
    expect(after[0].id).toBe(first);
    expect(after[1].id).not.toBe(second);
    expect(after[1].id).toBeTruthy();
    expect(await elementCount(page)).toBe(2);
  });

  test("deleting an image empties its slot and leaves a placeholder", async ({ page }) => {
    await openApp(page, "Layout");
    const [first, second] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().deleteElement(${JSON.stringify(first)})`);
    await page.waitForTimeout(150);
    const after = await slots(page);
    expect(after[0].id).toBeNull();
    expect(after[1].id).toBe(second);
    await expect.poll(() => page.evaluate(`ST().find(".layout-empty-slot").length`)).toBe(1);
  });
});

test.describe("dragging", () => {
  test("no resize handles; dragging onto another slot swaps", async ({ page }) => {
    const errors = await openApp(page, "Layout");
    const [first, second] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().selectElement(${JSON.stringify(first)})`);
    await page.waitForTimeout(150);
    expect(await page.evaluate(`ST().findOne("Transformer").enabledAnchors().length`)).toBe(0);
    expect(await page.evaluate(`ST().findOne("Transformer").rotateEnabled()`)).toBe(false);

    const a = await element<Img>(page, first);
    const b = await element<Img>(page, second);
    const from = await toScreen(page, a.x + a.width / 2, a.y + a.height / 2);
    const to = await toScreen(page, b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect.poll(() => page.evaluate(`!!ST().findOne(".layout-drop-target")`)).toBe(true);
    await page.mouse.up();

    await expect.poll(async () => (await slots(page))[0].id).toBe(second);
    expect((await slots(page))[1].id).toBe(first);
    expect(await page.evaluate(`!!ST().findOne(".layout-drop-target")`)).toBe(false);
    expect((await element<Img>(page, first)).x).toBeGreaterThan((await element<Img>(page, second)).x);
    expect(errors).toEqual([]);

    await page.evaluate(`S.getState().undo()`);
    expect((await slots(page))[0].id).toBe(first);
  });

  test("dragging inside a slot moves the picture within the trim", async ({ page }) => {
    await openApp(page, "Layout");
    const [wide] = await addImages(page, [[1600, 400, "#a33"], [800, 800, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateLayout({ sameShape: true })`);
    const before = await element<Img>(page, wide);
    const startX = before.layoutCrop?.x ?? 0;
    expect(startX).toBeGreaterThan(0);

    const at = await toScreen(page, before.x + before.width / 2, before.y + before.height / 2);
    await dragBy(page, at, { x: -40, y: 0 });

    const after = await element<Img>(page, wide);
    expect(after.layoutCrop?.x).toBeGreaterThan(startX);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect((await slots(page))[0].id).toBe(wide);
  });

  test("a locked image doesn't move or swap", async ({ page }) => {
    await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateElement(${JSON.stringify(first)}, { locked: true })`);
    const a = await element<Img>(page, first);
    const from = await toScreen(page, a.x + a.width / 2, a.y + a.height / 2);
    await dragBy(page, from, { x: 300, y: 0 });
    expect((await slots(page))[0].id).toBe(first);
  });

  test("crop in a layout changes only what shows, and the slot re-fits", async ({ page }) => {
    await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().selectElement(${JSON.stringify(first)})`);
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "Crop", exact: true }).click();
    await page.waitForTimeout(200);
    await dragBy(page, await handle(page, "bottom-right"), { x: -60, y: -40 });
    await page.getByRole("button", { name: "Apply crop" }).click();
    await page.waitForTimeout(150);
    const cropped = await element<Img>(page, first);
    expect(cropped.crop?.width).toBeLessThan(1);
    expect((await slots(page))[0].id).toBe(first);
  });
});

test.describe("labels and marks", () => {
  test("before and after labels show by default, edit, and hide", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Before & after");
    const texts = () =>
      page.evaluate<string[]>(`ST().find("Text").map((t) => t.text()).filter((t) => ["Before", "After", "Then", "Now"].includes(t))`);
    await expect.poll(texts).toEqual(["Before", "After"]);
    expect(await page.evaluate(`ST().find("Arrow").length`)).toBe(1);

    await page.getByRole("textbox", { name: "Label 1" }).fill("Then");
    await expect.poll(texts).toEqual(["Then", "After"]);

    await page.evaluate(`S.getState().updateLayout({ showLabels: false })`);
    await expect.poll(texts).toEqual([]);
  });

  test("do and don't shows both badges, red first", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Do & don't");
    const fills = await page.evaluate<string[]>(`ST().find("Circle").map((c) => c.fill())`);
    expect(fills).toEqual(["#dc2626", "#1d9e75"]);
    await expect(page.getByRole("textbox", { name: "Label 1" })).toHaveValue("Don't");
  });

  test("the export has the artwork but not the empty slots", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"]]);
    await pick(page, "Do & don't");
    const hidden = await page.evaluate<boolean[]>(`(async () => {
      const seen = [];
      const stage = ST();
      const real = stage.toDataURL.bind(stage);
      stage.toDataURL = (o) => {
        seen.push(stage.findOne(".layout-slots").visible(), stage.find("Circle")[0].isVisible());
        return real(o);
      };
      await X.renderCanvasDataURL("png", 1);
      stage.toDataURL = real;
      return seen;
    })()`);
    expect(hidden).toEqual([false, true]);
  });
});

test.describe("whole-layout actions", () => {
  test("style all images copies the selected look to the others", async ({ page }) => {
    await openApp(page, "Layout");
    const [first, second, third] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"], [800, 600, "#33a"]]);
    await pick(page, "Three in a row");
    const look = { cornerRadius: 40, shadow: { enabled: false, color: "#000", blur: 1, offsetX: 0, offsetY: 0 }, border: { enabled: true, color: "#f00", width: 4 } };
    await page.evaluate(`(() => {
      const s = S.getState();
      s.updateElement(${JSON.stringify(second)}, ${JSON.stringify(look)});
      s.selectElement(${JSON.stringify(second)});
    })()`);
    await page.getByRole("button", { name: "Apply style to images" }).click();

    for (const id of [first, third]) {
      const img = await element<Img>(page, id);
      expect(img.cornerRadius).toBe(40);
      expect(img.shadow).toEqual(look.shadow);
    }
    await page.evaluate(`S.getState().undo()`);
    expect((await element<Img>(page, first)).cornerRadius).toBe(8);
  });

  test("fit canvas wraps the images with even padding, and keeps them whole", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 800, "#a33"], [800, 800, "#33a"]]);
    await pick(page, "Stacked");
    const before = await canvasSize(page);
    await page.getByRole("button", { name: "Fit canvas to layout" }).click();
    await page.waitForTimeout(150);

    const after = await canvasSize(page);
    expect(after.width).not.toBe(before.width);
    const [a, b] = await images(page);
    const left = Math.min(a.x, b.x);
    const right = after.width - Math.max(a.x + a.width, b.x + b.width);
    const top = Math.min(a.y, b.y);
    const bottom = after.height - Math.max(a.y + a.height, b.y + b.height);
    for (const pad of [right, top, bottom]) expect(Math.abs(pad - left)).toBeLessThan(2);
    expect(left).toBeGreaterThan(0);
  });
});

test.describe("history and saving", () => {
  test("picking a layout is one undo step, back to where the images were", async ({ page }) => {
    await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await page.waitForTimeout(500);
    const before = await element<Img>(page, first);
    await pick(page, "Side by side");
    await page.waitForTimeout(500);
    expect((await element<Img>(page, first)).x).not.toBeCloseTo(before.x, 0);

    await page.evaluate(`S.getState().undo()`);
    expect(await page.evaluate(`S.getState().layout`)).toBeNull();
    expect((await element<Img>(page, first)).x).toBeCloseTo(before.x, 3);
    await page.evaluate(`S.getState().redo()`);
    expect((await slots(page))[0].id).toBe(first);
  });

  test("a project keeps its layout, and older projects open without one", async ({ page }) => {
    await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateLayout({ spacing: 77 })`);
    const saved = await page.evaluate<string>(`JSON.stringify(S.getState().toProject())`);

    await page.evaluate(`(() => { const s = S.getState(); s.resetProject(); s.loadProject(${saved}); })()`);
    expect(await page.evaluate(`S.getState().layout.spacing`)).toBe(77);
    expect((await slots(page))[0].id).toBe(first);

    const older = JSON.parse(saved);
    delete older.layout;
    await page.evaluate(`S.getState().loadProject(${JSON.stringify(older)})`);
    expect(await page.evaluate(`S.getState().layout`)).toBeNull();
    const parsed = await page.evaluate<boolean>(`(async () => {
      const importers = await import("/src/lib/importers.ts");
      return !!importers.parseProject(${JSON.stringify(JSON.stringify(older))});
    })()`);
    expect(parsed).toBe(true);
  });

  test("resizing the canvas re-arranges the images", async ({ page }) => {
    await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    const before = (await element<Img>(page, first)).width;
    await page.evaluate(`S.getState().setCanvas({ label: "Custom", width: 800, height: 800 })`);
    await page.waitForTimeout(100);
    expect((await element<Img>(page, first)).width).toBeLessThan(before);
  });
});

test("Layout is under Design, and Position explains itself in a layout", async ({ page }) => {
  await openApp(page, "Layout");
  await expect(page.getByText("PICK A LAYOUT")).toBeVisible();
  await expect(page.getByText("PRO")).toHaveCount(0);

  const [first] = await addImages(page, [[800, 600, "#a33"]]);
  await pick(page, "Side by side");
  await page.evaluate(`S.getState().selectElement(${JSON.stringify(first)})`);
  await expect(page.getByRole("button", { name: "Padding", exact: true })).toHaveCount(0);
  await openSection(page, "Position & size");
  await expect(page.getByText("Its place comes from the layout.", { exact: false })).toBeVisible();
});

/* ------------------------------------------------------------------------------------------ */

const panel = (page: Page) => page.getByRole("complementary", { name: "Panel" });

/** Pixels of a still export at scale 1, in canvas pixels. */
const exportPixels = (page: Page, points: [number, number][]) =>
  page.evaluate<number[][]>(`(async () => {
    const url = await X.renderCanvasDataURL("png", 1);
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

/** The divider lines on the canvas, as their points. */
const dividers = (page: Page) =>
  page.evaluate<number[][]>(`ST().findOne(".content").find("Line").filter((l) => l.points().length === 4).map((l) => l.points())`);

const near = (a: number[], b: number[], slack = 24) => b.every((value, i) => Math.abs(a[i] - value) <= slack);
const centreOf = (img: Img) => ({ x: img.x + img.width / 2, y: img.y + img.height / 2 });

test.describe("divider", () => {
  test("sits in the middle of each gap, as long as the images, and exports", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateLayout({ spacing: 60 })`);
    expect(await dividers(page)).toEqual([]);

    await panel(page).getByRole("radio", { name: "Dashed", exact: true }).click();
    await panel(page).getByLabel("Divider color").fill("#00ff00");
    expect(await page.evaluate(`S.getState().layout.divider`)).toEqual({ style: "dashed", color: "#00ff00", width: 3 });

    const [a, b] = await images(page);
    const [line] = await dividers(page);
    const x = (a.x + a.width + b.x) / 2;
    expect(line[0]).toBeCloseTo(x, 3);
    expect(line[2]).toBeCloseTo(x, 3);
    expect(line[1]).toBeCloseTo(Math.min(a.y, b.y), 3);
    expect(line[3]).toBeCloseTo(Math.max(a.y + a.height, b.y + b.height), 3);

    await panel(page).getByRole("radio", { name: "Solid", exact: true }).click();
    await page.evaluate(`S.getState().updateLayout({ divider: { ...S.getState().layout.divider, width: 10 } })`);
    const [[r, g, bl]] = await exportPixels(page, [[x, a.y + a.height / 2]]);
    expect(near([r, g, bl], [0, 255, 0])).toBe(true);

    await pick(page, "Stacked");
    const [top, bottom] = await images(page);
    const [across] = await dividers(page);
    expect(across[1]).toBeCloseTo((top.y + top.height + bottom.y) / 2, 3);
    expect(across[1]).toBe(across[3]);

    await addImages(page, [[800, 600, "#3a3"]]);
    await pick(page, "Three in a row");
    expect(await dividers(page)).toHaveLength(2);

    // The arrow fills that gap.
    await pick(page, "Arrow between");
    await expect(panel(page).getByText("DIVIDER")).toHaveCount(0);
    expect(await dividers(page)).toEqual([]);
  });
});

test.describe("cards", () => {
  test("keep the slots' edges, move the images in, and give each its colour", async ({ page }) => {
    await openApp(page, "Layout");
    const [first, second] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    const [a0, b0] = await images(page);

    await panel(page).getByRole("switch", { name: /CARDS/ }).click();
    await expect.poll(async () => (await images(page))[0].width).toBeLessThan(a0.width - 1);
    const [a, b] = await images(page);
    const card = (id: string) =>
      page.evaluate<{ x: number; width: number; fill: string }>(`(() => {
        const group = ST().findOne("#card-${id}");
        const rect = group.findOne("Rect");
        return { x: group.x() + rect.x(), width: rect.width(), fill: rect.fill() };
      })()`);
    const left = await card(first);
    const right = await card(second);
    // The cards reach where the images used to.
    expect(left.x).toBeCloseTo(a0.x, 0);
    expect(right.x + right.width).toBeCloseTo(b0.x + b0.width, 0);
    expect(right.x - (left.x + left.width)).toBeCloseTo(b0.x - (a0.x + a0.width), 0);
    expect(left.x).toBeLessThan(a.x);
    expect(left.fill).toBe("#FFFFFF");

    // One card, then all of them.
    await panel(page).getByRole("button", { name: "Card for Image 2" }).click();
    await panel(page).getByLabel("Card color").fill("#00ff00");
    let fills = await page.evaluate<{ color: string }[]>(`S.getState().layout.cards.fills`);
    expect(fills.map((f) => f.color)).toEqual(["#FFFFFF", "#00ff00"]);
    await panel(page).getByRole("button", { name: "All", exact: true }).click();
    await panel(page).getByLabel("Card color").fill("#ff0000");
    fills = await page.evaluate(`S.getState().layout.cards.fills`);
    expect(fills.map((f) => f.color)).toEqual(["#ff0000", "#ff0000"]);

    // In the export, the padding round an image is its card.
    await panel(page).getByRole("button", { name: "Card for Image 2" }).click();
    await panel(page).getByLabel("Card color").fill("#00ff00");
    const [leftPad, rightPad] = await exportPixels(page, [
      [(left.x + a.x) / 2, a.y + a.height / 2],
      [(b.x + b.width + right.x + right.width) / 2, b.y + b.height / 2],
    ]);
    expect(near(leftPad, [255, 0, 0])).toBe(true);
    expect(near(rightPad, [0, 255, 0])).toBe(true);

    // Colours belong to the place: swapping the images leaves them there.
    await page.evaluate(`S.getState().swapSlots(0, 1)`);
    await expect.poll(async () => (await card(second)).fill).toBe("#ff0000");
    expect((await card(first)).fill).toBe("#00ff00");

    // With no padding a card is the image's own size, there for see-through pictures.
    await page.evaluate(`S.getState().updateLayout({ cards: { ...S.getState().layout.cards, padding: 0 } })`);
    await expect.poll(async () => (await card(first)).width).toBeCloseTo((await element<Img>(page, first)).width, 3);
  });

  test("can be a gradient, and move with their image when it's animated", async ({ page }) => {
    await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Side by side");
    await panel(page).getByRole("switch", { name: /CARDS/ }).click();
    await panel(page).getByRole("button", { name: "Card for Image 1" }).click();
    await panel(page).getByRole("radio", { name: "Gradient", exact: true }).click();
    await page.evaluate(`(() => {
      const { cards } = S.getState().layout;
      S.getState().updateLayout({ cards: { ...cards, fills: [{ kind: "gradient", from: "#ff0000", to: "#0000ff", angle: 0 }, cards.fills[1]] } });
    })()`);
    await expect(panel(page).getByText("GRADIENT", { exact: true })).toBeVisible();

    const a = (await images(page))[0];
    const pad = await page.evaluate<number>(`-ST().findOne("#card-${first}").findOne("Rect").x()`);
    const [start, end] = await exportPixels(page, [
      [a.x - pad / 2, a.y + a.height / 2],
      [a.x + a.width + pad / 2, a.y + a.height / 2],
    ]);
    expect(start[0]).toBeGreaterThan(start[2]);
    expect(end[2]).toBeGreaterThan(end[0]);

    await page.evaluate(`(async () => {
      window.POSE = await import("/src/lib/motion/pose.ts");
      S.getState().setElementMotion(${JSON.stringify(first)}, { enter: "rise", start: 1, takes: 0.8 });
      POSE.poseStage(ST(), S.getState(), 1.4, { scale: 1, frame: 0, preview: true });
    })()`);
    const posed = await page.evaluate<{ image: number[]; card: number[] }>(`(() => {
      const of = (node) => [node.x(), node.y(), node.opacity()];
      return { image: of(ST().findOne("#${first}")), card: of(ST().findOne("#card-${first}")) };
    })()`);
    expect(posed.card).toEqual(posed.image);
    expect(posed.image[1]).toBeGreaterThan(a.y);

    await page.evaluate(`POSE.restStage(ST(), S.getState(), { scale: 1, frame: 0, preview: true })`);
    expect(await page.evaluate(`ST().findOne("#card-${first}").y()`)).toBeCloseTo(a.y, 3);
  });
});

test.describe("overlap", () => {
  test("brings images closer or further, and In front picks the one on top", async ({ page }) => {
    await openApp(page, "Layout");
    const [first, second] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#33a"]]);
    await pick(page, "Overlap up");
    await expect(panel(page).getByText("OVERLAP", { exact: true })).toBeVisible();
    await expect(panel(page).getByText("SPACING", { exact: true })).toHaveCount(0);

    const apart = async () => {
      const [a, b] = await images(page);
      return Math.hypot(centreOf(a).x - centreOf(b).x, centreOf(a).y - centreOf(b).y);
    };
    const usual = await apart();
    await page.evaluate(`S.getState().updateLayout({ overlap: 100 })`);
    const most = await apart();
    await page.evaluate(`S.getState().updateLayout({ overlap: 0 })`);
    const least = await apart();
    expect(most).toBeLessThan(usual);
    expect(least).toBeGreaterThan(usual);

    const order = () => page.evaluate<string[]>(`S.getState().elements.map((e) => e.id)`);
    expect(await order()).toEqual([first, second]);
    await panel(page).getByRole("button", { name: "Image 1", exact: true }).click();
    await expect.poll(order).toEqual([second, first]);
    expect(await page.evaluate(`S.getState().layout.front`)).toBe(0);

    // A click where they overlap reaches the one on top.
    const [a, b] = await images(page);
    const hit = await page.evaluate<number | null>(`(async () => {
      const L = await import("/src/lib/layouts.ts");
      const s = S.getState();
      return L.slotAt(L.arrangeLayout(s.layout, s.elements, s.canvas), ${(Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2}, ${(Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2});
    })()`);
    expect(hit).toBe(0);

    // Being in front belongs to the picture.
    await page.evaluate(`S.getState().swapSlots(0, 1)`);
    expect(await page.evaluate(`S.getState().layout.front`)).toBe(1);
    await expect.poll(order).toEqual([second, first]);
  });

  test("in a fan, the middle can be in front, with the sides behind it", async ({ page }) => {
    await openApp(page, "Layout");
    const ids = await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"], [800, 600, "#33a"]]);
    await pick(page, "Fan");
    await panel(page).getByRole("button", { name: "Image 2", exact: true }).click();
    await expect
      .poll(() => page.evaluate<string[]>(`S.getState().elements.map((e) => e.id)`))
      .toEqual([ids[0], ids[2], ids[1]]);
  });
});

test.describe("canvas size", () => {
  test("suggests sizes that suit the layout and its images, and sets one in a click", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[1600, 900, "#a33"], [1600, 900, "#33a"]]);
    const suggested = () =>
      panel(page)
        .getByRole("group", { name: "Suggested sizes" })
        .getByRole("button")
        .evaluateAll((buttons) => buttons.map((b) => b.querySelector("span:last-child")?.textContent));

    await pick(page, "Side by side");
    expect(await suggested()).toEqual(["Twitter / X Card", "Twitter / X In-stream", "Dribbble Shot"]);

    await pick(page, "Stacked");
    expect(await suggested()).toEqual(["Instagram Post (Portrait)", "Instagram Post (Square)", "Dribbble Shot"]);

    const portrait = panel(page).getByRole("button", { name: /Instagram Post \(Portrait\)/ });
    await portrait.click();
    expect(await canvasSize(page)).toMatchObject({ width: 1080, height: 1350, label: "Instagram Post (Portrait)" });
    await expect(portrait).toHaveAttribute("aria-pressed", "true");
    // The size picker offers it too, under the same name.
    expect(await page.evaluate(`(async () => (await import("/src/lib/canvasSizes.ts")).PLATFORMS[0].sizes[1])()`)).toEqual({
      label: "Post (Portrait)",
      width: 1080,
      height: 1350,
    });
  });
});

test.describe("saving the new settings", () => {
  test("a project keeps them, and an older overlap layout opens looking the same", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"], [800, 600, "#33a"]]);
    await pick(page, "Cascade");
    await page.evaluate(`S.getState().updateLayout({ overlap: 40 })`);
    await page.waitForTimeout(100);
    const placed = await images(page);
    await page.evaluate(`S.getState().updateLayout({
      front: 1,
      cards: { show: true, padding: 50, corners: 10, fills: [
        { kind: "solid", color: "#ff0000" },
        { kind: "gradient", from: "#000000", to: "#ffffff", angle: 90 },
        { kind: "solid", color: "#00ff00" },
      ] },
    })`);
    const saved = await page.evaluate<string>(`JSON.stringify(S.getState().toProject())`);

    await page.evaluate(`(() => { const s = S.getState(); s.resetProject(); s.loadProject(${saved}); })()`);
    expect(await page.evaluate(`S.getState().layout`)).toMatchObject({
      overlap: 40,
      front: 1,
      cards: { show: true, padding: 50, corners: 10 },
      divider: { style: "none" },
    });

    // From before overlap had a setting: spacing 60 was how far apart they sat.
    const older = JSON.parse(saved);
    older.layout.spacing = 60;
    delete older.layout.overlap;
    delete older.layout.front;
    delete older.layout.divider;
    delete older.layout.cards;
    await page.evaluate(`(() => { const s = S.getState(); s.resetProject(); s.loadProject(${JSON.stringify(older)}); })()`);
    expect(await page.evaluate(`S.getState().layout`)).toMatchObject({
      overlap: 40,
      cards: { show: false },
      divider: { style: "none" },
    });
    expect(await page.evaluate(`S.getState().layout.cards.fills.length`)).toBe(3);
    await page.waitForTimeout(100);
    for (const img of await images(page)) {
      const before = placed.find((p) => p.id === img.id);
      expect(img.x).toBeCloseTo(before?.x ?? NaN, 3);
      expect(img.y).toBeCloseTo(before?.y ?? NaN, 3);
    }
  });
});

test.describe("tilting the whole layout", () => {
  /** Where each image's corners land on the tilted surface, in canvas pixels: TL, TR, BL, BR. */
  const surfaceCorners = (page: Page) =>
    page.evaluate<{ id: string; corners: [number, number][]; box: { x: number; y: number; width: number; height: number } }[]>(`(async () => {
      const LY = await import("/src/lib/layouts.ts");
      const TR = await import("/src/lib/tiltRender.ts");
      const s = S.getState();
      const surface = LY.layoutSurfaceOf(s.layout, LY.arrangeLayout(s.layout, s.elements, s.canvas));
      return s.layout.slots.filter((slot) => slot.id).map((slot) => {
        const el = s.elements.find((e) => e.id === slot.id);
        const look = { tilt: { ...surface.tilt, scale: 1 }, width: el.width, height: el.height, cornerRadius: 0, plane: TR.planeFrom(surface.pivot, surface.span, el) };
        const corners = TR.tiltCorners(look).map((c) => [el.x + c.x, el.y + c.y]);
        return { id: el.id, corners, box: TR.tiltBoxOf(TR.tiltCorners(look)) };
      });
    })()`);

  test("turns its images, cards and badges together, as one surface", async ({ page }) => {
    const errors = await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"]]);
    await pick(page, "Before & after");
    await page.evaluate(`S.getState().updateLayout({ cards: { ...S.getState().layout.cards, show: true } })`);
    await panel(page).getByRole("button", { name: "Iso Left" }).click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(`S.getState().layout.tilt`)).toMatchObject({ tiltX: 25, tiltY: -25, tiltZ: 0 });

    const placed = await surfaceCorners(page);
    for (const { id, box } of placed) {
      // Drawn turned, where the surface puts it.
      const node = (await page.evaluate(`(() => {
        const n = ST().findOne("#${id}").findOne(".tilted-picture");
        return n && { visible: n.isVisible(), x: n.x(), y: n.y(), width: n.width(), height: n.height() };
      })()`)) as { visible: boolean; x: number; y: number; width: number; height: number } | null;
      expect(node).toMatchObject({ visible: true, ...box });
      expect(await page.evaluate(`!!ST().findOne("#card-${id}").findOne(".turned-card")?.isVisible()`)).toBe(true);
    }
    // One surface: the top edges of side-by-side images lie on one straight line, as they
    // would if each were a strip of the same page. Turned each about its own middle, they
    // wouldn't.
    const [a, b] = placed;
    const [p, q] = [a.corners[0], b.corners[1]];
    const offLine = (point: [number, number]) =>
      Math.abs((q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0])) / Math.hypot(q[0] - p[0], q[1] - p[1]);
    expect(offLine(a.corners[1])).toBeLessThan(0.5);
    expect(offLine(b.corners[0])).toBeLessThan(0.5);

    // The labels are drawn turned, in place of the flat ones.
    expect(await page.evaluate(`!!ST().findOne(".turned-decor")?.isVisible()`)).toBe(true);
    expect(await page.evaluate(`ST().findOne(".layout-decor").visible()`)).toBe(false);
    expect(errors).toEqual([]);
  });

  test("an image takes its layout's tilt, and gets its own back when the layout is flat", async ({ page }) => {
    const errors = await openApp(page, "Layout");
    const [first] = await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"]]);
    await pick(page, "Side by side");
    await page.evaluate(`(async () => {
      const T = await import("/src/lib/tilt.ts");
      S.getState().updateElement(${JSON.stringify(first)}, { transform: T.serializeImageTilt({ ...T.DEFAULT_IMAGE_TILT, tiltY: 15 }) });
      S.getState().updateLayout({ tilt: { ...S.getState().layout.tilt, tiltX: 20 } });
      S.getState().selectElement(${JSON.stringify(first)});
    })()`);
    await openSection(page, "3D");
    const properties = page.getByRole("complementary", { name: "Properties" });
    await expect(properties.getByText("It tilts with its layout", { exact: false })).toBeVisible();
    await expect(properties.getByRole("button", { name: "Iso Left" })).toHaveCount(0);

    await page.evaluate(`S.getState().updateLayout({ tilt: { ...S.getState().layout.tilt, tiltX: 0 } })`);
    await expect(properties.getByRole("button", { name: "Iso Left" })).toBeVisible();
    // Its own tilt was kept, and shows again.
    expect(await page.evaluate(`S.getState().elements.find((e) => e.id === ${JSON.stringify(first)}).transform`)).toContain(
      "rotateY(15deg)",
    );
    await expect.poll(() => page.evaluate(`!!ST().findOne("#${first}").findOne(".tilted-picture")?.isVisible()`)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("is saved with the project, and an older layout opens flat", async ({ page }) => {
    await openApp(page, "Layout");
    await addImages(page, [[800, 600, "#a33"], [800, 600, "#3a3"]]);
    await pick(page, "Side by side");
    await page.evaluate(`S.getState().updateLayout({ tilt: { tiltX: 10, tiltY: -20, tiltZ: 5, perspective: 900, innerShadow: false } })`);
    const saved = await page.evaluate<string>(`JSON.stringify(S.getState().toProject())`);
    await page.evaluate(`(() => { const s = S.getState(); s.resetProject(); s.loadProject(${saved}); })()`);
    expect(await page.evaluate(`S.getState().layout.tilt`)).toEqual({
      tiltX: 10,
      tiltY: -20,
      tiltZ: 5,
      perspective: 900,
      innerShadow: false,
    });

    const older = JSON.parse(saved);
    delete older.layout.tilt;
    await page.evaluate(`(() => { const s = S.getState(); s.resetProject(); s.loadProject(${JSON.stringify(older)}); })()`);
    expect(await page.evaluate(`S.getState().layout.tilt`)).toMatchObject({ tiltX: 0, tiltY: 0, tiltZ: 0 });
    expect(await page.evaluate(`!!ST().findOne(".tilted-picture")`)).toBe(false);
  });
});
