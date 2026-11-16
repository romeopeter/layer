import { expect, test, type Page } from "@playwright/test";
import { addTwoToneImage, fakeShell, openApp, openSection, openTool } from "./helpers";

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

const pose = (page: Page, t: number) =>
  page.evaluate(`(() => {
    const s = S.getState();
    POSE.poseStage(ST(), s, ${t}, { scale: 1, frame: 0, preview: true });
    ST().batchDraw();
  })()`);

const nodeAttrs = (page: Page, id: string): Promise<{ x: number; y: number; opacity: number; rotation: number }> =>
  page.evaluate(`(() => {
    const node = ST().findOne("#${id}");
    return { x: node.x(), y: node.y(), opacity: node.opacity(), rotation: node.rotation() };
  })()`);

test.describe("Animate: objects", () => {
  test("an object comes in when it starts, and with a loop, leaves the way it came", async ({ page }) => {
    await openApp(page);
    await loadMotion(page);
    const id = await addTwoToneImage(page);
    await page.evaluate(`S.getState().setElementMotion("${id}", { enter: "rise", start: 1, takes: 0.8 })`);

    await pose(page, 0.5);
    expect((await nodeAttrs(page, id)).opacity).toBe(0);
    await pose(page, 1.4);
    const rising = await nodeAttrs(page, id);
    expect(rising.opacity).toBeGreaterThan(0);
    expect(rising.y).toBeGreaterThan(200);
    await pose(page, 2.5);
    expect(await nodeAttrs(page, id)).toEqual({ x: 200, y: 200, opacity: 1, rotation: 0 });
    // Gone again by the length less its start: 6 − 1.
    await pose(page, 5.5);
    expect((await nodeAttrs(page, id)).opacity).toBe(0);

    await page.evaluate(`POSE.restStage(ST(), S.getState(), { scale: 1, frame: 0, preview: true })`);
    expect(await nodeAttrs(page, id)).toEqual({ x: 200, y: 200, opacity: 1, rotation: 0 });
  });

  test("text types itself out, and lines draw themselves", async ({ page }) => {
    await openApp(page);
    await loadMotion(page);
    const text = (await page.evaluate(`(() => {
      const s = S.getState();
      const id = s.addText("heading", { text: "Ship it today" });
      s.setElementMotion(id, { enter: "type", start: 0, takes: 2 });
      return id;
    })()`)) as string;
    const arrow = (await page.evaluate(`(() => {
      const s = S.getState();
      const id = s.addShape("arrow", {
        x: 300, y: 300, width: 500, height: 200,
        connector: { start: [0, 0], end: [500, 200], route: "straight", headStart: "none", headEnd: "arrow" },
      });
      s.setElementMotion(id, { enter: "draw", start: 0, takes: 2 });
      return id;
    })()`)) as string;
    await page.waitForTimeout(200);

    await pose(page, 1);
    const typed = (await page.evaluate(`ST().findOne("#${text}").findOne("Text").text()`)) as string;
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.length).toBeLessThan("Ship it today".length);
    expect("Ship it today".startsWith(typed)).toBe(true);

    const drawing = (await page.evaluate(`(() => {
      const group = ST().findOne("#${arrow}");
      const stroke = group.findOne(".draw-stroke");
      return { dash: stroke.dash(), offset: stroke.dashOffset(), head: group.findOne(".draw-head").visible() };
    })()`)) as { dash: number[]; offset: number; head: boolean };
    expect(drawing.dash.length).toBe(2);
    expect(drawing.offset).toBeGreaterThan(0);
    expect(drawing.head).toBe(false);

    await page.evaluate(`POSE.restStage(ST(), S.getState(), { scale: 1, frame: 0, preview: true })`);
    expect(await page.evaluate(`ST().findOne("#${text}").findOne("Text").text()`)).toBe("Ship it today");
    expect(await page.evaluate(`ST().findOne("#${arrow}").findOne(".draw-head").visible()`)).toBe(true);
    expect(await page.evaluate(`ST().findOne("#${arrow}").findOne(".draw-stroke").dashOffset()`)).toBe(0);
  });

  test("a picture turns in 3D, and in a mockup it moves in 2D instead", async ({ page }) => {
    await openApp(page);
    await loadMotion(page);
    const id = await addTwoToneImage(page);
    await page.evaluate(`S.getState().setElementMotion("${id}", { keep: "swing" })`);

    await pose(page, 1);
    const turned = (await page.evaluate(`(() => {
      const posed = ST().findOne("#${id}").findOne(".posed-picture");
      return { visible: posed.visible(), width: posed.width() };
    })()`)) as { visible: boolean; width: number };
    expect(turned.visible).toBe(true);
    expect(turned.width).toBeGreaterThan(0);

    await page.evaluate(`POSE.restStage(ST(), S.getState(), { scale: 1, frame: 0, preview: true })`);
    expect(await page.evaluate(`ST().findOne("#${id}").findOne(".posed-picture").visible()`)).toBe(false);

    await page.evaluate(`S.getState().setDeviceFrame("${id}", ${JSON.stringify({
      device: "iphone-14-pro",
      finish: "default",
      landscape: false,
      fit: "fill",
      zoom: 1,
      panX: 0,
      panY: 0,
      barColor: "#000000",
      thickness: 1,
      roundness: 1,
      address: "example.com",
    })})`);
    await page.waitForFunction(`!!ST().findOne("#${id}").findOne(".mockup-frame")`);
    await pose(page, 1);
    // Swing becomes a sway: the whole device rocks, flat.
    expect(Math.abs((await nodeAttrs(page, id)).rotation)).toBeGreaterThan(0.1);
    expect(await page.evaluate(`!!ST().findOne("#${id}").findOne(".posed-picture")`)).toBe(false);
  });

  test("each object is offered only the moves it can make", async ({ page }) => {
    await openApp(page);
    const id = await addTwoToneImage(page);
    await openSection(page, "Animate");
    const properties = page.getByRole("complementary", { name: "Properties" });
    await properties.getByRole("combobox", { name: "Comes in" }).click();
    await expect(page.getByRole("option", { name: "Turn in" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Type" })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Draw" })).toHaveCount(0);
    await page.getByRole("option", { name: "Pop" }).click();
    expect(await page.evaluate(`S.getState().elements[0].motion.enter`)).toBe("pop");
    await expect(properties.getByText("STARTS AT")).toBeVisible();

    await properties.getByRole("combobox", { name: "Keeps moving" }).click();
    await expect(page.getByRole("option", { name: "Swing" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Spin" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.evaluate(`(() => {
      const s = S.getState();
      s.selectElement(s.addText("body", { text: "Hello" }));
    })()`);
    await openSection(page, "Animate");
    await properties.getByRole("combobox", { name: "Comes in" }).click();
    await expect(page.getByRole("option", { name: "Type" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Turn in" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.evaluate(`(() => {
      const s = S.getState();
      s.selectElement(s.addShape("emoji", { text: "🚀" }));
    })()`);
    await openSection(page, "Animate");
    await properties.getByRole("combobox", { name: "Keeps moving" }).click();
    await expect(page.getByRole("option", { name: "Spin" })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(id).toBeTruthy();
  });

  test("bringing everything in one by one staggers the starts in one undo step", async ({ page }) => {
    await openApp(page, "Animate");
    await addTwoToneImage(page);
    await page.evaluate(`(() => {
      const s = S.getState();
      s.addText("heading", { text: "One" });
      s.addText("body", { text: "Two" });
      s.selectElement(null);
    })()`);
    await page.waitForTimeout(500);
    const panel = animatePanel(page);
    await panel.getByRole("radio", { name: "Pop" }).click();
    await panel.getByRole("button", { name: "Bring in everything, one by one" }).click();
    const starts = await page.evaluate(`S.getState().elements.map((el) => [el.motion.enter, el.motion.start])`);
    expect(starts).toEqual([
      ["pop", 0],
      ["pop", 0.2],
      ["pop", 0.4],
    ]);
    await expect(panel.getByText("3 objects move on their own.")).toBeVisible();

    await page.keyboard.press("Meta+z");
    expect(await page.evaluate(`S.getState().elements.every((el) => !el.motion)`)).toBe(true);
    await page.keyboard.press("Meta+Shift+z");
    await panel.getByRole("button", { name: "Clear object moves" }).click();
    expect(await page.evaluate(`S.getState().elements.every((el) => !el.motion)`)).toBe(true);
  });
});

test.describe("Animate: zoom spots", () => {
  test("the camera zooms into each spot, which stays inside the canvas and out of exports", async ({ page }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    const id = await addTwoToneImage(page);
    const panel = animatePanel(page);
    await panel.getByRole("button", { name: "Zoom to the selection" }).click();
    const spot = (await page.evaluate(`S.getState().motion.spots[0]`)) as { cx: number; cy: number; zoom: number };
    // Framing the 800×400 picture at 200,200 on a 2400×1350 canvas.
    expect(spot.cx).toBeCloseTo(600 / 2400, 5);
    expect(spot.cy).toBeCloseTo(400 / 1350, 5);
    expect(spot.zoom).toBeGreaterThan(1.25);
    await expect(page.getByRole("button", { name: "Play animation" })).toBeVisible();
    expect(await page.evaluate(`ST().find(".zoom-spot").length`)).toBe(1);

    // One spot over 6 s with a loop: in for 1.5 s, held for 3 s, out for 1.5 s.
    const held = (await page.evaluate(`CAM.cameraAt(S.getState().motion, { x: 0.5, y: 0.5 }, 3)`)) as {
      cx: number;
      cy: number;
      zoom: number;
    };
    expect(held.zoom).toBeCloseTo(spot.zoom, 6);
    // The window can't go past the canvas's edge: its middle is pulled in.
    const half = 0.5 / held.zoom;
    expect(held.cx).toBeGreaterThanOrEqual(half - 1e-9);
    expect(held.cy).toBeGreaterThanOrEqual(half - 1e-9);

    await page.evaluate(`PLAY.seek(3)`);
    expect((await cameraAttrs(page)).scaleX).toBeCloseTo(spot.zoom, 5);
    // While previewing, the spots are out of the way.
    expect(await page.evaluate(`ST().find(".zoom-spot").length`)).toBe(0);
    await page.keyboard.press("Escape");

    const exported = (await page.evaluate(`(async () => {
      const stage = ST();
      const layer = stage.findOne(".zoom-spots");
      const capture = stage.toDataURL.bind(stage);
      let during = null;
      stage.toDataURL = (options) => {
        during = layer.visible();
        return capture(options);
      };
      await X.renderCanvasDataURL("png", 1);
      stage.toDataURL = capture;
      return { during, after: layer.visible() };
    })()`)) as { during: boolean; after: boolean };
    expect(exported).toEqual({ during: false, after: true });

    // Delete takes it away; undo brings it back.
    await panel.getByRole("button", { name: "Delete spot 1" }).click();
    expect(await page.evaluate(`S.getState().motion.spots.length`)).toBe(0);
    await page.keyboard.press("Meta+z");
    expect(await page.evaluate(`S.getState().motion.spots.length`)).toBe(1);
    expect(id).toBeTruthy();
  });

  test("a spot is moved by dragging its edge on the canvas", async ({ page }) => {
    await openApp(page, "Animate");
    await page.evaluate(`S.getState().selectElement(null)`);
    await animatePanel(page).getByRole("button", { name: "Add a zoom spot" }).click();
    const before = (await page.evaluate(`S.getState().motion.spots[0]`)) as { cx: number; cy: number };
    expect(before).toMatchObject({ cx: 0.5, cy: 0.5 });

    const edge = (await page.evaluate(`(() => {
      const stage = ST();
      const box = stage.findOne(".zoom-spot").getClientRect();
      const at = stage.container().getBoundingClientRect();
      return { x: at.left + box.x + box.width / 2, y: at.top + box.y + 1 };
    })()`)) as { x: number; y: number };
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x - 60, edge.y + 30, { steps: 6 });
    await page.mouse.up();
    const after = (await page.evaluate(`S.getState().motion.spots[0]`)) as { cx: number; cy: number };
    expect(after.cx).toBeLessThan(0.5);
    expect(after.cy).toBeGreaterThan(0.5);
    // A drag is one step.
    await page.keyboard.press("Meta+z");
    expect(await page.evaluate(`S.getState().motion.spots[0].cx`)).toBe(0.5);
  });

  test("with depth, the background moves less than the design", async ({ page }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    await page.evaluate(`S.getState().setMotion({ camera: "push-in", strength: "strong" })`);
    await page.evaluate(`PLAY.seek(3)`);
    const scales = (await page.evaluate(`[ST().findOne(".motion-camera").scaleX(), ST().findOne(".motion-background").scaleX()]`)) as number[];
    expect(scales[0]).toBeGreaterThan(scales[1]);
    expect(scales[1]).toBeGreaterThan(1);

    await animatePanel(page).getByText("DEPTH").click();
    expect(await page.evaluate(`S.getState().motion.depth`)).toBe(false);
    await page.evaluate(`PLAY.seek(3)`);
    const same = (await page.evaluate(`[ST().findOne(".motion-camera").scaleX(), ST().findOne(".motion-background").scaleX()]`)) as number[];
    expect(same[0]).toBeCloseTo(same[1], 6);
  });
});

test.describe("Animate: live backgrounds", () => {
  /** A drawn background at a moment of its loop, as a data URL to compare. */
  const drawnAt = (page: Page, phase: number, frame = 0): Promise<string> =>
    page.evaluate(`(async () => {
      const node = ST().findOne(".background-fill");
      const out = document.createElement("canvas");
      await node.getAttr("drawAt")(0.25, out, { phase: ${phase}, frame: ${frame} });
      return out.toDataURL();
    })()`);

  test("an abstract background flows round a loop that ends where it starts", async ({ page }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    await page.evaluate(`S.getState().setBackground({ mode: "abstract" })`);
    await page.waitForFunction(`!!ST().findOne(".background-fill")`);

    const rest = (await page.evaluate(`(async () => {
      const out = document.createElement("canvas");
      await ST().findOne(".background-fill").getAttr("drawAt")(0.25, out);
      return out.toDataURL();
    })()`)) as string;
    expect(await drawnAt(page, 0)).toBe(rest);
    expect(await drawnAt(page, 1)).toBe(rest);
    // Just before the end it's nearly the start again; halfway, it's moved on.
    const difference = (phase: number) =>
      page.evaluate(`(async () => {
        const node = ST().findOne(".background-fill");
        const read = async (live) => {
          const out = document.createElement("canvas");
          await node.getAttr("drawAt")(0.25, out, live);
          return out.getContext("2d").getImageData(0, 0, out.width, out.height).data;
        };
        const a = await read(null);
        const b = await read({ phase: ${phase}, frame: 0 });
        let sum = 0;
        for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        return sum / (a.length / 4) / 3;
      })()`) as Promise<number>;
    // A frame before the end differs from the start as little as a frame after it does.
    const before = await difference(0.995);
    const after = await difference(0.005);
    const halfway = await difference(0.5);
    expect(before).toBeLessThan(after * 1.5 + 0.5);
    expect(halfway).toBeGreaterThan(before * 3);

    await animatePanel(page).getByText("LIVE BACKGROUND").click();
    expect(await page.evaluate(`S.getState().motion.liveBackground`)).toBe(true);
    await expect(page.getByRole("button", { name: "Play animation" })).toBeVisible();
    await page.evaluate(`PLAY.seek(3)`);
    await page.waitForTimeout(100);
    // The live picture is on the canvas, not the resting one.
    const showing = await page.evaluate(`(() => {
      const node = ST().findOne(".background-fill");
      return node.image().width;
    })()`);
    expect(showing).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });

  test("grain flickers from frame to frame only while live", async ({ page }) => {
    await openApp(page, "Animate");
    await page.evaluate(`S.getState().setBackground({ mode: "solid" })`);
    await expect(animatePanel(page).getByText("A plain color has nothing to move.")).toBeVisible();
    await page.evaluate(`S.getState().setEffects({ grain: 0.6 })`);
    await page.waitForFunction(`!!ST().findOne(".background-fill")`);
    await expect(animatePanel(page).getByText("Its grain flickers like film.")).toBeVisible();
    expect(await drawnAt(page, 0, 1)).not.toBe(await drawnAt(page, 0, 2));
    expect(await drawnAt(page, 0, 0)).toBe(await drawnAt(page, 0, 0));
  });

  test("a plain gradient sways, and a pattern slides one tile per loop", async ({ page }) => {
    await openApp(page, "Animate");
    await loadMotion(page);
    await page.evaluate(`S.getState().setBackground({ mode: "gradient" })`);
    await page.evaluate(`S.getState().setMotion({ liveBackground: true })`);
    const ends = (t: number) =>
      page.evaluate(`(() => {
        POSE.poseStage(ST(), S.getState(), ${t}, { scale: 1, frame: 0, preview: true });
        return ST().findOne(".plain-gradient").fillLinearGradientStartPoint();
      })()`);
    const start = await ends(0);
    expect(await ends(1.5)).not.toEqual(start);
    expect(await ends(6)).toEqual(start);

    await page.evaluate(`S.getState().setBackground({ mode: "pattern" })`);
    await page.waitForFunction(`!!ST().findOne(".pattern-fill")`);
    const offset = (await page.evaluate(`(() => {
      POSE.poseStage(ST(), S.getState(), 3, { scale: 1, frame: 0, preview: true });
      const fill = ST().findOne(".pattern-fill");
      return { offset: fill.fillPatternOffset(), tile: fill.fillPatternImage().width };
    })()`)) as { offset: { x: number }; tile: number };
    expect(offset.offset.x).toBeCloseTo(offset.tile / 2, 5);
    await page.evaluate(`POSE.restStage(ST(), S.getState(), { scale: 1, frame: 0, preview: true })`);
    expect(await page.evaluate(`ST().findOne(".pattern-fill").fillPatternOffset().x`)).toBe(0);
  });
});

test.describe("Animate: export", () => {
  /** The file an export makes, as bytes, and how long it took. */
  const render = (page: Page, options: Record<string, unknown>) =>
    page.evaluate(`(async () => {
      const ex = await import("/src/lib/motion/exportAnimation.ts");
      const started = performance.now();
      const blob = await ex.renderAnimation(${JSON.stringify({ scale: 1, fps: 30, gifSize: "small", ...options })});
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return { bytes, type: blob.type, seconds: (performance.now() - started) / 1000 };
    })()`) as Promise<{ bytes: number[]; type: string; seconds: number }>;

  const text = (bytes: number[]) => String.fromCharCode(...bytes.slice(0, 4096));

  test("an MP4 is an H.264 video, and the canvas is back at rest after", async ({ page }) => {
    await openApp(page);
    await addTwoToneImage(page);
    await page.evaluate(`S.getState().setMotion({ camera: "push-in", length: 2 })`);
    const before = await page.evaluate(`JSON.stringify(S.getState().elements)`);
    const file = await render(page, { format: "mp4" });
    expect(file.type).toBe("video/mp4");
    const head = text(file.bytes);
    expect(head).toContain("ftyp");
    expect(head).toContain("avc1");
    expect(await page.evaluate(`S.getState().previewing`)).toBe(false);
    expect(await page.evaluate(`ST().findOne(".motion-camera").scaleX()`)).toBe(1);
    expect(await page.evaluate(`JSON.stringify(S.getState().elements)`)).toBe(before);
  });

  test("a GIF loops forever and has a frame for every twentieth of a second", async ({ page }) => {
    await openApp(page);
    const id = await addTwoToneImage(page);
    await page.evaluate(`(() => {
      const s = S.getState();
      s.setMotion({ length: 2 });
      s.setElementMotion("${id}", { keep: "float" });
    })()`);
    const file = await render(page, { format: "gif" });
    expect(file.type).toBe("image/gif");
    expect(String.fromCharCode(...file.bytes.slice(0, 6))).toBe("GIF89a");
    expect(text(file.bytes)).toContain("NETSCAPE2.0");
    // Each frame starts with a graphic control extension: 0x21 0xF9 0x04.
    let frames = 0;
    for (let i = 0; i + 2 < file.bytes.length; i++) {
      if (file.bytes[i] === 0x21 && file.bytes[i + 1] === 0xf9 && file.bytes[i + 2] === 0x04) frames++;
    }
    expect(frames).toBe(40);
    // Small: 480 on the long side.
    const width = file.bytes[6] | (file.bytes[7] << 8);
    expect(width).toBe(480);
  });

  test("cancelling stops it and puts the canvas back", async ({ page }) => {
    await openApp(page);
    await addTwoToneImage(page);
    await page.evaluate(`S.getState().setMotion({ camera: "drift", length: 4 })`);
    const outcome = await page.evaluate(`(async () => {
      const ex = await import("/src/lib/motion/exportAnimation.ts");
      const stop = new AbortController();
      const run = ex.renderAnimation({ format: "gif", scale: 1, fps: 30, gifSize: "small", signal: stop.signal,
        onProgress: (done) => { if (done === 5) stop.abort(); } });
      try { await run; return "finished"; } catch (error) { return error.name; }
    })()`);
    expect(outcome).toBe("AbortError");
    expect(await page.evaluate(`S.getState().previewing`)).toBe(false);
    expect(await page.evaluate(`ST().findOne(".motion-camera").scaleX()`)).toBe(1);
  });
});

test.describe("Animate: the Export menu", () => {
  const openExport = async (page: Page) => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
  };

  test("asks for motion first, and keeps the background in videos", async ({ page }) => {
    await openApp(page);
    await addTwoToneImage(page);
    await openExport(page);
    await expect(page.getByRole("button", { name: "Download GIF" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Download MP4" })).toBeDisabled();
    await page.getByRole("button", { name: "Animate", exact: true }).last().click();
    await expect(animatePanel(page).getByRole("group", { name: "Camera moves" })).toBeVisible();

    await animatePanel(page).getByRole("button", { name: "Drift" }).click();
    await openExport(page);
    await expect(page.getByRole("button", { name: "Download GIF" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Download MP4" })).toBeEnabled();
    await page.getByText("Remove background").click();
    await expect(page.getByRole("button", { name: "Download GIF" })).toBeDisabled();
    await expect(page.getByText("Videos and GIFs keep their background.")).toBeVisible();
  });

  test("a GIF downloads after its progress shows", async ({ page }) => {
    await openApp(page);
    await addTwoToneImage(page);
    await page.evaluate(`S.getState().setMotion({ camera: "push-in", length: 2 })`);
    await openExport(page);
    await page.getByRole("button", { name: "ADVANCE OPTIONS" }).click();
    await page.getByRole("combobox", { name: "GIF size" }).selectOption("small");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download GIF" }).click();
    await expect(page.getByRole("dialog", { name: "Making your GIF" })).toBeVisible();
    expect((await download).suggestedFilename()).toMatch(/^layer-design-\d+\.gif$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(`S.getState().previewing`)).toBe(false);
  });

  test("on the desktop, the MP4 goes to the save command as raw bytes", async ({ page }) => {
    await fakeShell(page, `(command) => null`);
    await openApp(page);
    await addTwoToneImage(page);
    await page.evaluate(`S.getState().setMotion({ camera: "rise", length: 2 })`);
    await openExport(page);
    await page.getByRole("button", { name: "ADVANCE OPTIONS" }).click();
    await page.getByRole("combobox", { name: "Scale" }).selectOption("1");
    await page.getByRole("button", { name: "Download MP4" }).click();
    await page.waitForFunction(`CALLS.some((call) => call[0] === "export_static")`, null, { timeout: 60_000 });
    const head = await page.evaluate(`(() => {
      const bytes = CALLS.find((call) => call[0] === "export_static")[1];
      return bytes instanceof Uint8Array ? String.fromCharCode(...bytes.slice(0, 64)) : null;
    })()`);
    expect(head).toContain("ftyp");
  });
});
