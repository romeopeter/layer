import { expect, test } from "@playwright/test";
import { fakeShell, openApp, shellCalls, shellEvent } from "./helpers";

test.describe("Layer's own updates", () => {
  test("a newer version shows its notes, and installs with a restart", async ({ page }) => {
    await fakeShell(
      page,
      `(command) => {
        if (command === "check_for_update") return { version: "9.9.9", notes: "Faster exports." };
        if (command === "install_update") return new Promise(() => {});
        return null;
      }`,
    );
    await openApp(page);
    await expect.poll(async () => (await shellCalls(page, "plugin:event|listen")).length).toBeGreaterThan(0);
    await shellEvent(page, "menu", "check-updates");
    const dialog = page.getByRole("dialog", { name: "A new Layer is ready" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Version 9.9.9 is ready.", { exact: false })).toBeVisible();
    await expect(dialog.getByText("Faster exports.")).toBeVisible();

    await dialog.getByRole("button", { name: "Restart and update" }).click();
    await expect(page.getByRole("dialog", { name: "Updating Layer" })).toBeVisible();
    await expect.poll(async () => (await shellCalls(page, "install_update")).length).toBe(1);
    await shellEvent(page, "update-progress", [50, 200]);
    await expect(page.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("aria-valuenow", "25");
  });

  test("asked for, it says when Layer is up to date, or why it couldn't check", async ({ page }) => {
    await fakeShell(
      page,
      `(command) => {
        if (command === "check_for_update") {
          if (window.OFFLINE) throw "Layer couldn't check for updates. Check your connection and try again.";
          return null;
        }
        return null;
      }`,
    );
    await openApp(page);
    await page.getByRole("navigation", { name: "Tools" }).getByRole("button", { name: "Customize" }).click();
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(page.getByRole("dialog", { name: "Layer is up to date" })).toBeVisible();
    await page.getByRole("button", { name: "OK" }).click();

    await page.evaluate(`window.OFFLINE = true`);
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(page.getByRole("dialog", { name: "Layer couldn't update" })).toBeVisible();
    await expect(page.getByText("Check your connection and try again.")).toBeVisible();
  });

  test("a quiet check that finds one shows an Update button instead of a dialog", async ({ page }) => {
    await fakeShell(page, `(command) => command === "check_for_update" ? { version: "9.9.9", notes: null } : null`);
    await openApp(page);
    await page.evaluate(`(async () => (await import("/src/lib/updates.ts")).checkForUpdates({ manual: false }))()`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "A new Layer is ready" })).toBeVisible();
  });

  test("the web build has no updates to check", async ({ page }) => {
    await openApp(page);
    await page.getByRole("navigation", { name: "Tools" }).getByRole("button", { name: "Customize" }).click();
    await expect(page.getByText(/^Layer \d+\.\d+\.\d+$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  });
});
