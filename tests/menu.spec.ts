import { expect, test } from "@playwright/test";
import { addTwoToneImage, elementCount, fakeShell, openApp, shellCalls, shellEvent } from "./helpers";

test.describe("the menu bar", () => {
  test("its items run Layer's actions", async ({ page }) => {
    await fakeShell(page, `(command) => null`);
    await openApp(page);
    const id = await addTwoToneImage(page);
    await expect.poll(async () => (await shellCalls(page, "plugin:event|listen")).length).toBeGreaterThan(0);

    // 100% is the canvas fitted to the window, and as close as zoom goes.
    await shellEvent(page, "menu", "zoom-out");
    await shellEvent(page, "menu", "zoom-out");
    expect(await page.evaluate(`S.getState().zoom`)).toBe(80);
    await shellEvent(page, "menu", "zoom-in");
    expect(await page.evaluate(`S.getState().zoom`)).toBe(90);
    await shellEvent(page, "menu", "zoom-fit");
    expect(await page.evaluate(`S.getState().zoom`)).toBe(100);

    await page.evaluate(`S.getState().selectElement("${id}")`);
    await shellEvent(page, "menu", "duplicate");
    expect(await elementCount(page)).toBe(2);
    await shellEvent(page, "menu", "undo");
    expect(await elementCount(page)).toBe(1);

    await shellEvent(page, "menu", "dark-mode");
    expect(await page.evaluate(`S.getState().preferences.theme`)).toBe("light");
    // The menu's tick follows.
    await expect
      .poll(async () => (await shellCalls(page, "sync_menu")).at(-1))
      .toEqual({ darkMode: false, grid: false });

    await shellEvent(page, "menu", "settings");
    await expect(page.getByRole("complementary", { name: "Panel" }).getByText("CUSTOMIZE", { exact: true })).toBeVisible();

    // Someone else's item (the system's own) does nothing here.
    await shellEvent(page, "menu", "quit");
    expect(await elementCount(page)).toBe(1);
  });

  test("New Design asks first, and only clears if you say so", async ({ page }) => {
    await fakeShell(page, `(command, args) => command === "confirm" ? window.ANSWER : null`);
    await openApp(page);
    await addTwoToneImage(page);
    await page.evaluate(`window.ANSWER = false`);
    await shellEvent(page, "menu", "new");
    await expect.poll(async () => (await shellCalls(page, "confirm")).length).toBe(1);
    expect(await elementCount(page)).toBe(1);

    await page.evaluate(`window.ANSWER = true`);
    await shellEvent(page, "menu", "new");
    await expect.poll(() => elementCount(page)).toBe(0);
  });

  test("a shortcut the page runs isn't run again by the menu hearing the same press", async ({ page }) => {
    await fakeShell(page, `(command) => null`);
    await openApp(page);
    const id = await addTwoToneImage(page);
    await page.evaluate(`S.getState().selectElement("${id}")`);
    await page.keyboard.press("Meta+d");
    await shellEvent(page, "menu", "duplicate");
    expect(await elementCount(page)).toBe(2);
    // A while later, the menu's own click runs.
    await page.waitForTimeout(400);
    await shellEvent(page, "menu", "duplicate");
    expect(await elementCount(page)).toBe(3);
  });

  test("the shortcuts work in the browser too", async ({ page }) => {
    await openApp(page);
    const id = await addTwoToneImage(page);
    await page.evaluate(`S.getState().addText("heading", { text: "Hi" })`);
    await page.keyboard.press("Meta+Minus");
    expect(await page.evaluate(`S.getState().zoom`)).toBe(90);
    await page.keyboard.press("Meta+Equal");
    expect(await page.evaluate(`S.getState().zoom`)).toBe(100);
    await page.keyboard.press("Meta+Minus");
    await page.keyboard.press("Meta+0");
    expect(await page.evaluate(`S.getState().zoom`)).toBe(100);
    await page.evaluate(`S.getState().selectElement(null)`);
    await page.keyboard.press("Meta+a");
    expect(await page.evaluate(`S.getState().selectedIds.length`)).toBe(2);
    await page.evaluate(`S.getState().selectElement("${id}")`);
    await page.keyboard.press("Meta+d");
    expect(await elementCount(page)).toBe(3);
    await page.keyboard.press("Meta+Shift+e");
    await expect(page.getByText("EXPORT OPTIONS")).toBeVisible();
  });
});
