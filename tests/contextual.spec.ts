import { expect, test, type Page } from "@playwright/test";
import { addTwoToneImage, openApp, openSection, solidPng, toScreen } from "./helpers";

const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const rail = (page: Page) => page.getByRole("navigation", { name: "Tools" });

/** A Properties section's header, which other buttons may share a name with. */
const section = (page: Page, title: string) =>
  properties(page).locator("button[aria-expanded]", { hasText: new RegExp(`^${title.replace(/[&]/g, "\\$&")}$`) });

/** The kind of thing Properties is showing, from its heading. */
const showing = (page: Page) =>
  properties(page).locator("div.uppercase").first().textContent();

test("the rail groups everything into five intents", async ({ page }) => {
  const errors = await openApp(page);
  const names = await rail(page).getByRole("button").allTextContents();
  expect(names.map((n) => n.trim())).toEqual(["Add", "Templates", "Design", "Brand", "Animate", "Customize"]);
  // Settings of a selected object aren't navigation any more.
  for (const gone of ["Shadow", "Corner", "3D", "Position", "Mark", "Watermark"]) {
    await expect(rail(page).getByRole("button", { name: gone, exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("Properties follows the selection: canvas, image, text, element, and back", async ({ page }) => {
  const errors = await openApp(page);
  expect(await showing(page)).toBe("Canvas");
  await expect(properties(page).getByRole("button", { name: "Background", exact: true })).toBeVisible();

  const image = await addTwoToneImage(page);
  expect(await showing(page)).toBe("Image");
  for (const title of ["Edit", "Appearance", "Shadow", "3D", "Mockup", "Position & size", "Motion"]) {
    await expect(section(page, title)).toBeVisible();
  }
  await expect(section(page, "Typography")).toHaveCount(0);

  await page.evaluate(`S.getState().addText("heading")`);
  expect(await showing(page)).toBe("Text");
  await expect(properties(page).getByRole("button", { name: "Typography", exact: true })).toBeVisible();
  await expect(properties(page).getByRole("combobox", { name: "Font" })).toBeVisible();

  await page.evaluate(`S.getState().selectElement(S.getState().addShape("star", { x: 1700, y: 900, width: 300, height: 300 }))`);
  expect(await showing(page)).toBe("Element");
  await expect(properties(page).getByRole("button", { name: "Style", exact: true })).toBeVisible();

  // An empty part of the canvas goes back to the canvas.
  const empty = await toScreen(page, 2300, 80);
  await page.mouse.click(empty.x, empty.y);
  expect(await showing(page)).toBe("Canvas");
  void image;
  expect(errors).toEqual([]);
});

test("a setting changes the selected object at once, and undoes", async ({ page }) => {
  await openApp(page);
  const id = await addTwoToneImage(page);
  const shadowOn = () =>
    page.evaluate<boolean>(`!!S.getState().elements.find((e) => e.id === ${JSON.stringify(id)}).shadow?.enabled`);
  const before = await shadowOn();
  await page.waitForTimeout(500);
  await openSection(page, "Shadow");
  await properties(page).getByRole("switch").first().click();
  expect(await shadowOn()).toBe(!before);
  await page.waitForTimeout(500);
  await page.evaluate(`S.getState().undo()`);
  expect(await shadowOn()).toBe(before);
});

test("sections stay open or closed as you move between images", async ({ page }) => {
  await openApp(page);
  const first = await addTwoToneImage(page);
  await openSection(page, "3D");
  const second = await addTwoToneImage(page);
  expect(second).not.toBe(first);
  await expect(properties(page).getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("the open rail group hides its panel for more canvas, and brings it back", async ({ page }) => {
  await openApp(page);
  const add = rail(page).getByRole("button", { name: "Add", exact: true });
  await expect(page.getByRole("complementary", { name: "Panel" })).toBeVisible();
  const before = await page.evaluate<number>(`ST().scaleX()`);
  await add.click();
  await expect(page.getByRole("complementary", { name: "Panel" })).toHaveCount(0);
  // The canvas takes the room.
  await expect.poll(() => page.evaluate<number>(`ST().scaleX()`)).toBeGreaterThan(before);
  await add.click();
  await expect(page.getByRole("complementary", { name: "Panel" })).toBeVisible();
});

test("a group reopens on its last tab, and the canvas's links open the right one", async ({ page }) => {
  await openApp(page, "Layers");
  await rail(page).getByRole("button", { name: "Add", exact: true }).click();
  await rail(page).getByRole("button", { name: "Design", exact: true }).click();
  expect(await page.evaluate(`S.getState().activeTool`)).toBe("layers");

  await properties(page).getByRole("button", { name: "Edit background" }).click();
  expect(await page.evaluate(`S.getState().activeTool`)).toBe("background");
  await properties(page).getByRole("button", { name: "Choose a layout" }).click();
  expect(await page.evaluate(`S.getState().activeTool`)).toBe("layout");
});

test("a look dresses background, text and images together, as one undo step", async ({ page }) => {
  await openApp(page);
  const image = await addTwoToneImage(page);
  await page.evaluate(`S.getState().addText("heading")`);
  // Background, and the text's and image's settings (not sizes, which text re-measures).
  const looks = () =>
    page.evaluate(`JSON.stringify([S.getState().background, S.getState().elements.map((e) => [e.fontFamily, e.fill, e.cornerRadius, e.shadow])])`);
  const before = await looks();
  await page.waitForTimeout(500);

  await rail(page).getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Minimal look" }).click();
  const after: { mode: string; color: string; font: string; corner: number; shadow: boolean } = await page.evaluate(`(() => {
    const s = S.getState();
    const text = s.elements.find((e) => e.type === "text");
    const img = s.elements.find((e) => e.id === ${JSON.stringify(image)});
    return { mode: s.background.mode, color: s.background.color, font: text.fontFamily, corner: img.cornerRadius, shadow: img.shadow.enabled };
  })()`);
  expect(after).toMatchObject({ mode: "solid", color: "#FFFFFF", font: "Inter", shadow: true });
  expect(after.corner).toBeGreaterThan(0);

  await page.waitForTimeout(500);
  await page.evaluate(`S.getState().undo()`);
  expect(await looks()).toBe(before);
});

test("Replace image swaps the picture and keeps its place and width", async ({ page }) => {
  await openApp(page);
  const id = await addTwoToneImage(page);
  const before: { x: number; y: number; width: number; src: string } = await page.evaluate(`S.getState().elements[0]`);
  await page.setInputFiles('input[aria-label="Choose a picture to replace this one"]', solidPng());
  await expect.poll(() => page.evaluate(`S.getState().elements[0].src`)).not.toBe(before.src);
  const after: { x: number; y: number; width: number; id: string } = await page.evaluate(`S.getState().elements[0]`);
  expect(after).toMatchObject({ id, x: before.x, y: before.y, width: before.width });
});

test("the grid and snapping are set in one place, by zoom", async ({ page }) => {
  const errors = await openApp(page);
  // Canvas Properties is about the design; how you look at it stays with zoom.
  await expect(section(page, "Grid & guides")).toHaveCount(0);
  await expect(properties(page).getByRole("switch")).toHaveCount(0);

  const gridOn = () => page.evaluate<boolean>(`S.getState().grid.enabled`);
  const before = await gridOn();
  await page.getByRole("button", { name: "Show grid" }).click();
  expect(await gridOn()).toBe(!before);
  await page.getByRole("button", { name: "View settings" }).click();
  await expect(page.getByText("SNAP TO OBJECTS")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("text shows its shadow", async ({ page }) => {
  await openApp(page);
  await page.evaluate(`S.getState().addText("heading")`);
  await openSection(page, "Shadow");
  await properties(page).getByRole("switch").first().click();
  await expect
    .poll(() => page.evaluate(`ST().find("Text").some((t) => t.shadowColor() && t.shadowBlur() > 0)`))
    .toBe(true);
});
