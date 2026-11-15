import { expect, test } from "@playwright/test";
import { addTwoToneImage, openApp, solidPng } from "./helpers";

test("editing an image is in Properties once it's selected, and the canvas's when it isn't", async ({ page }) => {
  await openApp(page, "Images");
  const properties = page.getByRole("complementary", { name: "Properties" });
  const section = page.locator("#image-edit");
  await expect(section).toHaveCount(0);
  await expect(properties.getByText("Canvas", { exact: true })).toBeVisible();

  await page.setInputFiles('input[aria-label="Upload image to canvas"]', solidPng());
  for (const tab of ["Fix", "Style", "Adjust"]) {
    await expect(section.getByText(tab, { exact: true })).toBeVisible();
  }
  await expect(properties.getByText("Image", { exact: true })).toBeVisible();

  await page.evaluate(`S.getState().selectElement(null)`);
  await expect(section).toHaveCount(0);
  await expect(properties.getByText("Canvas", { exact: true })).toBeVisible();
});

test("the toolbar's Edit button opens the Edit section, wherever the left panel is", async ({ page }) => {
  await openApp(page);
  await addTwoToneImage(page);
  await page.evaluate(`(() => {
    const s = S.getState();
    s.setSectionOpen("image.edit", false);
    s.setActiveTool("layers");
  })()`);
  await expect(page.locator("#image-edit")).toHaveCount(0);

  // The floating toolbar's, not the Properties section with the same name.
  await page.locator('button[title="Edit"]').click();

  await expect(page.locator("#image-edit").getByText("Style", { exact: true })).toBeInViewport();
  // The left panel stays where it was.
  expect(await page.evaluate(`S.getState().activeTool`)).toBe("layers");
});
