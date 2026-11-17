import { expect, test, type Page } from "@playwright/test";
import { fakeShell, openApp, shellCalls } from "./helpers";

const panel = (page: Page) => page.getByRole("complementary", { name: "Panel" });
const openCustomize = (page: Page) =>
  page.getByRole("navigation", { name: "Tools" }).getByRole("button", { name: "Customize" }).click();
const dottedGrid = (page: Page) => page.evaluate(`!!document.querySelector("main .bg-dot-grid")`);

test.describe("Customize", () => {
  test("the dotted grid behind the canvas can be hidden", async ({ page }) => {
    await openApp(page);
    expect(await dottedGrid(page)).toBe(true);
    await openCustomize(page);
    await panel(page).getByText("SHOW DOTTED GRID").click();
    expect(await dottedGrid(page)).toBe(false);
    expect(await page.evaluate(`S.getState().preferences.dottedGrid`)).toBe(false);
    // A preference, not an edit.
    expect(await page.evaluate(`S.getState().canUndo`)).toBe(false);
  });

  test("reduce motion follows the system until it's set, and stops interface animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);
    expect(await page.evaluate(`document.documentElement.dataset.reduceMotion`)).toBe("true");
    await openCustomize(page);
    const reduce = panel(page).getByRole("switch").nth(1);
    await expect(reduce).toBeChecked();

    await panel(page).getByText("REDUCE MOTION").click();
    expect(await page.evaluate(`S.getState().preferences.reduceMotion`)).toBe(false);
    expect(await page.evaluate(`document.documentElement.dataset.reduceMotion`)).toBe("false");

    await panel(page).getByText("REDUCE MOTION").click();
    await page.getByRole("button", { name: "Customize Sidebar" }).click();
    const duration = await page.evaluate(`getComputedStyle(document.querySelector('[role="dialog"]')).animationDuration`);
    expect(parseFloat(duration as string)).toBeLessThan(0.001);
  });

  test("the AI panel is gone from the app", async ({ page }) => {
    await openApp(page);
    const groups = await page.getByRole("navigation", { name: "Tools" }).getByRole("button").allInnerTexts();
    expect(groups.map((name) => name.trim())).not.toContain("AI");
  });

  test("on the desktop, preferences are kept for next time, rail groups included", async ({ page }) => {
    await fakeShell(
      page,
      `(command) => command === "load_preferences"
        ? JSON.stringify({ theme: "dark", dottedGrid: false, reduceMotion: true, hiddenGroups: ["brand"] })
        : null`,
    );
    await openApp(page);
    await expect.poll(() => dottedGrid(page)).toBe(false);
    const rail = page.getByRole("navigation", { name: "Tools" });
    await expect(rail.getByRole("button", { name: "Brand", exact: true })).toHaveCount(0);
    expect(await page.evaluate(`document.documentElement.dataset.reduceMotion`)).toBe("true");

    await openCustomize(page);
    await page.getByRole("button", { name: "Customize Sidebar" }).click();
    await page.getByRole("button", { name: "Show Brand" }).click();
    await page.keyboard.press("Escape");
    await expect(rail.getByRole("button", { name: "Brand", exact: true })).toHaveCount(1);
    await expect
      .poll(async () => {
        const calls = await shellCalls(page, "store_preferences");
        return calls.length ? JSON.parse(calls.at(-1)?.preferences as string) : null;
      })
      .toEqual({ theme: "dark", dottedGrid: false, reduceMotion: true, hiddenGroups: [] });
  });
});
