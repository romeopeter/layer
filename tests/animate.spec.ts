import { expect, test, type Page } from "@playwright/test";
import { addTwoToneImage, openApp, openSection, openTool } from "./helpers";

/** The motion maths, reached through Vite, for checking poses against. */
const loadMotion = (page: Page) =>
  page.evaluate(`(async () => {
    window.CAM = await import("/src/lib/motion/camera.ts");
    window.POSE = await import("/src/lib/motion/pose.ts");
    window.PLAY = (await import("/src/lib/motion/playback.ts")).playback;
  })()`);

const cameraAttrs = (page: Page): Promise<{ x: number; y: number; scaleX: number }> =>
  page.evaluate(`(() => {
    const group = ST().findOne(".motion-camera");
    return { x: group.x(), y: group.y(), scaleX: group.scaleX() };
  })()`);

const animatePanel = (page: Page) => page.getByRole("complementary", { name: "Panel" });

test.describe("Animate: the camera", () => {
  test("a camera move is a setting that undoes, and Canvas Properties opens it", async ({ page }) => {
    await openApp(page, "Animate");
    await animatePanel(page).getByRole("group", { name: "Camera moves" }).getByRole("button", { name: "Push in" }).click();
    expect(await page.evaluate(`S.getState().motion.camera`)).toBe("push-in");
    await expect(animatePanel(page).getByText("Moves slowly closer to the main picture.")).toBeVisible();

    await page.keyboard.press("Meta+z");
    expect(await page.evaluate(`S.getState().motion.camera`)).toBe("still");

    await openTool(page, "Images");
    await openSection(page, "Animate");
    const properties = page.getByRole("complementary", { name: "Properties" });
    await expect(properties.getByText("No motion")).toBeVisible();
    await properties.getByRole("button", { name: "Open Animate" }).click();
    await expect(animatePanel(page).getByRole("group", { name: "Camera moves" })).toBeVisible();
  });

  test("the play bar shows only when something moves, and poses the canvas without touching the design", async ({
    page,
  }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    const id = await addTwoToneImage(page);
    await expect(page.getByRole("button", { name: "Play animation" })).toHaveCount(0);

    await animatePanel(page).getByRole("button", { name: "Push in" }).click();
    // Something to redo, which a preview mustn't wipe.
    await page.evaluate(`S.getState().setMotion({ length: 8 })`);
    await page.keyboard.press("Meta+z");
    expect(await page.evaluate(`S.getState().canRedo`)).toBe(true);
    const before = await page.evaluate(`JSON.stringify(S.getState().elements)`);

    await expect(page.getByRole("button", { name: "Play animation" })).toBeVisible();
    await page.evaluate(`PLAY.seek(3)`);
    expect(await page.evaluate(`S.getState().previewing`)).toBe(true);

    const expected = await page.evaluate(`(() => {
      const s = S.getState();
      const view = CAM.cameraAt(s.motion, POSE.focusOf(s), 3);
      return CAM.viewTransform(view, s.canvas.width, s.canvas.height);
    })()`);
    const posed = await cameraAttrs(page);
    expect(posed.scaleX).toBeGreaterThan(1);
    expect(posed.scaleX).toBeCloseTo((expected as { scaleX: number }).scaleX, 5);
    expect(posed.x).toBeCloseTo((expected as { x: number }).x, 3);

    // The preview is view-only: no handles.
    expect(await page.evaluate(`ST().findOne("Transformer").visible()`)).toBe(false);

    await page.keyboard.press("Escape");
    expect(await page.evaluate(`S.getState().previewing`)).toBe(false);
    expect(await cameraAttrs(page)).toEqual({ x: 0, y: 0, scaleX: 1 });
    expect(await page.evaluate(`JSON.stringify(S.getState().elements)`)).toBe(before);
    expect(await page.evaluate(`S.getState().canRedo`)).toBe(true);
    expect(await page.evaluate(`ST().findOne("#${id}").x()`)).toBe(200);
  });

  test("playing moves time forward, and the time can be dragged", async ({ page }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    await addTwoToneImage(page);
    await animatePanel(page).getByRole("button", { name: "Drift" }).click();

    await page.getByRole("button", { name: "Play animation" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Pause animation" }).click();
    const time = (await page.evaluate(`PLAY.time()`)) as number;
    expect(time).toBeGreaterThan(0.2);

    const thumb = page.getByRole("slider", { name: "Animation time" });
    await thumb.focus();
    await page.keyboard.press("End");
    expect(await page.evaluate(`PLAY.time()`)).toBeCloseTo(6, 3);

    await page.getByRole("button", { name: "Back to editing" }).click();
    expect(await page.evaluate(`S.getState().previewing`)).toBe(false);
  });

  test("a looping camera move ends where it starts, and saves with the project", async ({ page }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    await page.evaluate(`S.getState().setMotion({ camera: "pull-back", length: 5 })`);
    const ends = await page.evaluate(`(() => {
      const m = S.getState().motion;
      const focus = { x: 0.3, y: 0.6 };
      return [CAM.cameraAt(m, focus, 0), CAM.cameraAt(m, focus, 5), CAM.cameraAt(m, focus, 2.5)];
    })()`);
    const [start, end, middle] = ends as { zoom: number; cx: number }[];
    expect(end.zoom).toBeCloseTo(start.zoom, 6);
    expect(end.cx).toBeCloseTo(start.cx, 6);
    expect(start.zoom).toBeGreaterThan(1);
    expect(middle.zoom).toBeCloseTo(1, 6);

    const project = await page.evaluate(`S.getState().toProject()`);
    expect((project as { motion: { camera: string } }).motion.camera).toBe("pull-back");
    await page.evaluate(`S.getState().resetProject()`);
    expect(await page.evaluate(`S.getState().motion.camera`)).toBe("still");
    await page.evaluate((p) => (window as unknown as { S: { getState: () => { loadProject: (p: unknown) => void } } }).S.getState().loadProject(p), project);
    expect(await page.evaluate(`S.getState().motion.length`)).toBe(5);

    // A file from before Animate opens still.
    await page.evaluate((p) => {
      const old = { ...(p as Record<string, unknown>) };
      delete old.motion;
      (window as unknown as { S: { getState: () => { loadProject: (p: unknown) => void } } }).S.getState().loadProject(old);
    }, project);
    expect(await page.evaluate(`S.getState().motion.camera`)).toBe("still");
  });
});
