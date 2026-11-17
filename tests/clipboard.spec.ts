import { expect, test } from "@playwright/test";
import { elementCount, fakeShell, openApp, PNG_2X2, shellCalls } from "./helpers";

/** A paste with nothing in it the page can use, as when an app puts only TIFF there. */
const pasteNothing = (page: import("@playwright/test").Page, target = "window") =>
  page.evaluate(`(() => {
    const event = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true });
    (${target === "window" ? "document.body" : `document.querySelector(${JSON.stringify(target)})`}).dispatchEvent(event);
  })()`);

test("on the desktop, a picture the webview can't see is read from the system clipboard", async ({ page }) => {
  await fakeShell(
    page,
    `(command) => command === "read_clipboard_image"
      ? Uint8Array.from(atob(${JSON.stringify(PNG_2X2)}), (c) => c.charCodeAt(0)).buffer
      : null`,
  );
  await openApp(page);
  await pasteNothing(page);
  await expect.poll(() => elementCount(page)).toBe(1);
  expect(await page.evaluate(`S.getState().elements[0].src.startsWith("data:image/png")`)).toBe(true);
});

test("pasting into a field leaves the clipboard to the field", async ({ page }) => {
  await fakeShell(page, `(command) => null`);
  await openApp(page, "Text");
  await page.evaluate(`S.getState().selectElement(S.getState().addText("heading", { text: "Hi" }))`);
  await pasteNothing(page, "textarea");
  await page.waitForTimeout(200);
  expect(await shellCalls(page, "read_clipboard_image")).toHaveLength(0);
  expect(await elementCount(page)).toBe(1);
});

test("in the browser, nothing is asked of a shell", async ({ page }) => {
  await openApp(page);
  await pasteNothing(page);
  await page.waitForTimeout(200);
  expect(await elementCount(page)).toBe(0);
});
