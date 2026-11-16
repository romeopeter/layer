import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { addTwoToneImage, fakeShell, openApp, openSection, shellCalls, solidPng } from "./helpers";

interface Kit {
  id: string;
  name: string;
  colors: { id: string; name: string; hex: string }[];
  logos: { id: string; name: string; src: string }[];
  heading: { family: string; weight: number; colorId: string | null };
  body: { family: string; weight: number; colorId: string | null };
  images: { cornerShare: number; shadow: boolean };
}

const panel = (page: Page) => page.getByRole("complementary", { name: "Panel" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const activeKit = (page: Page): Promise<Kit> =>
  page.evaluate(`(() => { const s = S.getState(); return s.brandKits.find((k) => k.id === s.activeBrandKitId); })()`);

/** A kit with known colours, fonts and a logo, made the active one. */
const setKit = (page: Page) =>
  page.evaluate(`(() => {
    const s = S.getState();
    const id = s.createBrandKit();
    s.updateBrandKit(id, {
      name: "Acme",
      colors: [
        { id: "c1", name: "Ink", hex: "#112233" },
        { id: "c2", name: "Sun", hex: "#FFAA00" },
        { id: "c3", name: "Snow", hex: "#FAFAFA" },
      ],
      logos: [{ id: "l1", name: "Acme", src: "data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAOBQEBa0sVlQAAAABJRU5ErkJggg=="}" }],
      heading: { family: "JetBrains Mono", weight: 500, colorId: "c3", letterSpacing: 1 },
      body: { family: "DM Sans", weight: 400, colorId: "c2", letterSpacing: 0 },
      images: { cornerShare: 0.1, shadow: false },
    });
    return id;
  })()`);

test("a new kit starts from the design, and Apply brand dresses it in one undo step", async ({ page }) => {
  const errors = await openApp(page, "Brand kit");
  await expect(panel(page).getByText("Keep your logos, colors and fonts here")).toBeVisible();
  await page.getByRole("button", { name: "Create a brand kit" }).click();

  // The default gradient's two colours come with it.
  const started = await activeKit(page);
  expect(started.colors.map((c) => c.hex)).toEqual(["#1C1F3B", "#534AB7"]);
  await expect(page.getByRole("textbox", { name: "Brand name" })).toHaveValue("My brand");

  const image = await addTwoToneImage(page);
  await page.evaluate(`S.getState().addText("heading")`);
  await page.evaluate(`S.getState().addText("body")`);
  await setKit(page);
  await page.waitForTimeout(500);
  const before = await page.evaluate(`JSON.stringify([S.getState().background, S.getState().watermark, S.getState().elements.map((e) => [e.fontFamily, e.fill, e.cornerRadius, e.shadow])])`);

  await page.getByRole("button", { name: "Apply brand" }).click();
  const after: {
    bg: { mode: string; gradient: { from: string; to: string } };
    heading: { fontFamily: string; fontWeight: number; fill: string };
    body: { fontFamily: string; fill: string };
    image: { cornerRadius: number; shadow: { enabled: boolean }; height: number };
    own: { kind: string; logoSrc: string };
  } = await page.evaluate(`(() => {
    const s = S.getState();
    const text = (v) => s.elements.find((e) => e.type === "text" && e.variant === v);
    return {
      bg: s.background,
      heading: text("heading"),
      body: text("body"),
      image: s.elements.find((e) => e.id === ${JSON.stringify(image)}),
      own: s.watermark.own,
    };
  })()`);
  expect(after.bg.mode).toBe("gradient");
  expect(after.bg.gradient).toMatchObject({ from: "#112233", to: "#FFAA00" });
  expect(after.heading).toMatchObject({ fontFamily: "JetBrains Mono", fontWeight: 500, fill: "#FAFAFA" });
  expect(after.body).toMatchObject({ fontFamily: "DM Sans", fill: "#FFAA00" });
  expect(after.image.cornerRadius).toBe(Math.round(0.1 * after.image.height));
  expect(after.image.shadow.enabled).toBe(false);
  expect(after.own.kind).toBe("logo");
  expect(after.own.logoSrc).toContain("data:image/png");

  await page.waitForTimeout(500);
  await page.evaluate(`S.getState().undo()`);
  expect(
    await page.evaluate(`JSON.stringify([S.getState().background, S.getState().watermark, S.getState().elements.map((e) => [e.fontFamily, e.fill, e.cornerRadius, e.shadow])])`),
  ).toBe(before);
  expect(errors).toEqual([]);
});

test("each background type takes the brand's colours its own way", async ({ page }) => {
  await openApp(page);
  await setKit(page);
  const results: Record<string, unknown> = await page.evaluate(`(() => {
    const s = S.getState();
    const out = {};
    for (const mode of ["solid", "pattern", "abstract", "image"]) {
      s.setBackground({ mode });
      s.applyBrand(s.activeBrandKitId);
      const bg = S.getState().background;
      out[mode] = mode === "solid" ? bg.color : mode === "pattern" ? bg.pattern.colors : mode === "abstract" ? bg.backdrop.colors.slice(2) : bg.mode;
    }
    return out;
  })()`);
  expect(results).toEqual({
    solid: "#112233",
    pattern: { base: "#112233", accent: "#FFAA00" },
    abstract: ["#FFAA00", "#FAFAFA"],
    image: "image",
  });
});

test("brand colours are in every colour picker, and set the colour in one click", async ({ page }) => {
  const errors = await openApp(page, "Brand kit");
  await setKit(page);
  await page.evaluate(`S.getState().addText("heading")`);
  await openSection(page, "Appearance");
  const swatches = properties(page).getByRole("group", { name: "Brand colors" });
  await expect(swatches.getByRole("button")).toHaveCount(3);
  await swatches.getByRole("button", { name: "Sun, #FFAA00" }).click();
  expect(await page.evaluate(`S.getState().elements[0].fill`)).toBe("#FFAA00");
  await expect(swatches.getByRole("button", { name: "Sun, #FFAA00" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("colours are added, typed in, moved and deleted", async ({ page }) => {
  await openApp(page, "Brand kit");
  await setKit(page);
  await page.getByRole("button", { name: "Add a color" }).click();
  await page.getByRole("textbox", { name: "Hex code" }).fill("0a7");
  // Not a whole code yet, so nothing changes.
  expect((await activeKit(page)).colors[3].hex).toBe("#FFFFFF");
  await page.getByRole("textbox", { name: "Hex code" }).fill("#00aa77");
  await page.getByRole("textbox", { name: "Color name" }).fill("Mint");
  await page.getByRole("button", { name: "Move earlier" }).click();
  expect((await activeKit(page)).colors.map((c) => `${c.name} ${c.hex}`)).toEqual([
    "Ink #112233",
    "Sun #FFAA00",
    "Mint #00AA77",
    "Snow #FAFAFA",
  ]);

  // Deleting the heading's colour leaves headings their own.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit Snow, #FAFAFA" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const kit = await activeKit(page);
  expect(kit.colors).toHaveLength(3);
  expect(kit.heading.colorId).toBeNull();
});

test("a logo is uploaded, put on the canvas plainly, and made the watermark", async ({ page }) => {
  const errors = await openApp(page, "Brand kit");
  await page.getByRole("button", { name: "Create a brand kit" }).click();
  await page.evaluate(`S.getState().setLayout("side")`);
  const layoutBefore = await page.evaluate(`JSON.stringify(S.getState().layout)`);

  await page.getByLabel("Upload logos to the brand kit").setInputFiles(solidPng());
  await expect(page.getByRole("button", { name: "Add second to the canvas" })).toBeVisible();
  await page.getByRole("button", { name: "Add second to the canvas" }).click();
  await expect.poll(() => page.evaluate(`S.getState().elements.length`)).toBe(1);
  const logo: { cornerRadius: number; shadow: { enabled: boolean }; x: number; y: number } = await page.evaluate(`S.getState().elements[0]`);
  expect(logo.cornerRadius).toBe(0);
  expect(logo.shadow.enabled).toBe(false);
  expect(logo.x).toBeLessThan(200);
  expect(await page.evaluate(`JSON.stringify(S.getState().layout)`)).toBe(layoutBefore);

  await page.getByRole("button", { name: "Add second to the canvas" }).hover();
  await page.getByRole("button", { name: "Use second as your watermark" }).click();
  expect(await page.evaluate(`S.getState().watermark.own.kind`)).toBe("logo");
  expect(errors).toEqual([]);
});

test("kits are switched, duplicated and deleted, with a check first", async ({ page }) => {
  await openApp(page, "Brand kit");
  await setKit(page);
  await page.getByRole("button", { name: "Duplicate this kit" }).click();
  await expect(page.getByRole("textbox", { name: "Brand name" })).toHaveValue("Acme copy");
  await page.getByRole("combobox", { name: "Brand kit" }).click();
  await page.getByRole("option", { name: "Acme", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Brand name" })).toHaveValue("Acme");

  await page.getByRole("button", { name: "Delete this kit" }).click();
  await page.getByRole("button", { name: "Delete kit" }).click();
  await expect(page.getByRole("textbox", { name: "Brand name" })).toHaveValue("Acme copy");
  await page.getByRole("button", { name: "Delete this kit" }).click();
  await page.getByRole("button", { name: "Delete kit" }).click();
  await expect(page.getByRole("button", { name: "Create a brand kit" })).toBeVisible();
});

test("on the desktop, kits come back from their file and go to it", async ({ page }) => {
  const file = JSON.stringify({
    version: 1,
    activeId: "bk_old",
    kits: [
      { id: "bk_old", name: "Saved", colors: [{ id: "c1", name: "Ink", hex: "#112233" }, { id: 7, hex: "nope" }], heading: { family: "Gone Font" } },
      { name: "No id" },
    ],
  });
  await fakeShell(page, `(command) => command === "load_brand_kits" ? ${JSON.stringify(file)} : null`);
  const errors = await openApp(page, "Brand kit");
  await expect(page.getByRole("textbox", { name: "Brand name" })).toHaveValue("Saved");
  const kit = await activeKit(page);
  expect(kit.colors).toHaveLength(1);
  // A font that isn't there falls back to one of Layer's.
  expect(kit.heading.family).toBe("Bricolage Grotesque");

  await page.getByRole("textbox", { name: "Brand name" }).fill("Saved again");
  await expect.poll(async () => (await shellCalls(page, "store_brand_kits")).length).toBe(1);
  const stored = JSON.parse((await shellCalls(page, "store_brand_kits"))[0].kits as string) as { activeId: string; kits: Kit[] };
  expect(stored.activeId).toBe("bk_old");
  expect(stored.kits.map((k) => k.name)).toEqual(["Saved again"]);
  expect(errors).toEqual([]);
});

test("the font picker lists the brand's fonts first, and new text is set in the brand", async ({ page }) => {
  const errors = await openApp(page, "Text");
  await setKit(page);
  await page.getByRole("button", { name: "Add a heading" }).click();
  const heading: { fontFamily: string; fontWeight: number; fill: string } = await page.evaluate(`S.getState().elements[0]`);
  expect(heading).toMatchObject({ fontFamily: "JetBrains Mono", fontWeight: 500, fill: "#FAFAFA" });
  await expect(panel(page).getByText("New text is set in Acme's fonts and colors.")).toBeVisible();

  await properties(page).getByRole("combobox", { name: "Font" }).click();
  const options = await page.getByRole("option").allTextContents();
  expect(options.slice(0, 2)).toEqual(["JetBrains Mono", "DM Sans"]);
  // Layer's own follow, without repeating the brand's.
  expect(options.filter((name) => name === "DM Sans")).toHaveLength(1);
  await page.keyboard.press("Escape");

  // The text tool sets its text in the brand's body style.
  await page.evaluate(`S.getState().setMarkTool({ kind: "text" })`);
  const canvas = await page.locator(".canvas-artboard canvas").first().boundingBox();
  if (!canvas) throw new Error("Canvas isn't on screen");
  await page.mouse.click(canvas.x + 40, canvas.y + canvas.height - 40);
  const typed: { fontFamily: string; fill: string } = await page.evaluate(`S.getState().elements.at(-1)`);
  expect(typed).toMatchObject({ fontFamily: "DM Sans", fill: "#FFAA00" });
  expect(errors).toEqual([]);
});

test("pattern colours come from the brand, and stay when the kit goes", async ({ page }) => {
  const errors = await openApp(page, "Background");
  await setKit(page);
  await page.getByRole("radio", { name: "Pattern", exact: true }).click();
  const pair = page.getByRole("button", { name: "Ink / Sun" });
  await pair.click();
  expect(await page.evaluate(`S.getState().background.pattern.colors`)).toEqual({ base: "#112233", accent: "#FFAA00" });
  await expect(pair).toHaveAttribute("aria-pressed", "true");
  // Three colours, each way round.
  await expect(page.getByRole("button", { name: /^(Ink|Sun|Snow) \/ (Ink|Sun|Snow)$/ })).toHaveCount(6);

  await page.evaluate(`S.getState().deleteBrandKit(S.getState().activeBrandKitId)`);
  await expect(pair).toHaveCount(0);
  expect(await page.evaluate(`S.getState().background.pattern.colors`)).toEqual({ base: "#112233", accent: "#FFAA00" });
  expect(errors).toEqual([]);
});

test("Canvas Properties shows the active kit, and opens it", async ({ page }) => {
  await openApp(page);
  await openSection(page, "Brand");
  await expect(properties(page).getByText("No brand kit")).toBeVisible();
  await setKit(page);
  await expect(properties(page).getByText("Acme")).toBeVisible();
  await properties(page).getByRole("button", { name: "Open brand kit" }).click();
  expect(await page.evaluate(`S.getState().activeTool`)).toBe("brands");
});

/** Whether a font face of this family and weight has loaded on the page. */
const hasFont = (page: Page, family: string, weight: number) =>
  page.evaluate(`[...document.fonts].some((f) => f.family.replace(/"/g, "") === ${JSON.stringify(family)} && f.weight === "${weight}" && f.status === "loaded")`);

/** A real font file, under whatever name the test gives it. */
const fontFile = (name: string) => ({
  name,
  mimeType: "font/woff2",
  buffer: readFileSync(new URL("../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", import.meta.url)),
});

test("a font is uploaded, named from its file, used, and carried in the project", async ({ page }) => {
  const errors = await openApp(page, "Brand kit");
  await setKit(page);
  await page.getByLabel("Upload a font file to the brand kit").setInputFiles(fontFile("AcmeGrotesk-SemiBold.woff2"));
  await expect(page.getByRole("textbox", { name: "Font name" })).toHaveValue("Acme Grotesk");
  await expect(page.getByRole("group", { name: "Font file's weight" }).getByRole("radio", { name: "Bold" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Add font" }).click();
  await expect(panel(page).getByText("Bold · Uploaded")).toBeVisible();
  await expect.poll(() => hasFont(page, "Acme Grotesk", 700)).toBe(true);

  // Set headings in it, and apply.
  await page.getByRole("combobox", { name: "heading font" }).click();
  await page.getByRole("option", { name: "Acme Grotesk" }).click();
  await page.getByRole("radio", { name: "Bold" }).first().click();
  await page.evaluate(`S.getState().addText("heading")`);
  await page.getByRole("button", { name: "Apply brand" }).click();
  expect(await page.evaluate(`S.getState().elements[0].fontFamily`)).toBe("Acme Grotesk");

  const project = await page.evaluate<{ fonts?: { family: string; weight: number; src: string }[] }>(`S.getState().toProject()`);
  expect(project.fonts?.map((font) => [font.family, font.weight])).toEqual([["Acme Grotesk", 700]]);
  expect(project.fonts?.[0].src.startsWith("data:font/woff2;base64,")).toBe(true);

  // Opened somewhere without the kit, the project brings the font with it.
  const fresh = await page.context().newPage();
  await openApp(fresh);
  expect(await hasFont(fresh, "Acme Grotesk", 700)).toBe(false);
  await fresh.evaluate(`S.getState().loadProject(${JSON.stringify(project)})`);
  await expect.poll(() => hasFont(fresh, "Acme Grotesk", 700)).toBe(true);
  expect(errors).toEqual([]);
});

test("a file that isn't a font is refused, and a font named like Layer's must be renamed", async ({ page }) => {
  await openApp(page, "Brand kit");
  await setKit(page);
  await page.getByLabel("Upload a font file to the brand kit").setInputFiles({ ...solidPng(), name: "fake.ttf" });
  await expect(panel(page).getByText("That file isn't a font Layer can use, or it's damaged.")).toBeVisible();

  await page.getByLabel("Upload a font file to the brand kit").setInputFiles(fontFile("Inter-Regular.woff2"));
  await expect(page.getByRole("textbox", { name: "Font name" })).toHaveValue("Inter");
  await expect(page.getByRole("button", { name: "Add font" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Font name" }).fill("Inter Brand");
  await page.getByRole("button", { name: "Add font" }).click();
  expect((await activeKit(page)).heading.family).toBe("JetBrains Mono");
  await page.getByRole("button", { name: "Delete Inter Brand" }).click();
  await expect(panel(page).getByText("0 OF 12")).toBeVisible();
});

test("on the desktop, a Google font is tried by name, previewed, and added in every weight", async ({ page }) => {
  const font = fontFile("x.woff2").buffer.toString("base64");
  await fakeShell(
    page,
    `(command, args) => {
      if (command !== "google_font") return null;
      if (args.family !== "Real Font") throw "Google Fonts doesn't have that font in that weight.";
      return Uint8Array.from(atob(${JSON.stringify(font)}), (c) => c.charCodeAt(0)).buffer;
    }`,
  );
  const errors = await openApp(page, "Brand kit");
  await setKit(page);
  await page.getByRole("button", { name: "Add from Google Fonts" }).click();
  const dialog = page.getByRole("dialog", { name: "Add from Google Fonts" });

  await dialog.getByRole("textbox", { name: "Search Google Fonts" }).fill("Nope Font");
  await dialog.getByRole("option", { name: "Try “Nope Font”" }).click();
  await expect(dialog.getByText("Google Fonts doesn't have that font in that weight.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to kit" })).toBeDisabled();

  await dialog.getByRole("textbox", { name: "Search Google Fonts" }).fill("Real Font");
  await dialog.getByRole("option", { name: "Try “Real Font”" }).click();
  await expect(dialog.getByText("Brand new visuals, ready to ship")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to kit" }).click();
  await expect(dialog).toHaveCount(0);

  const added = (await activeKit(page)) as Kit & { fonts: { family: string; source: string; files: { weight: number }[] }[] };
  expect(added.fonts).toHaveLength(1);
  expect(added.fonts[0]).toMatchObject({ family: "Real Font", source: "google" });
  expect(added.fonts[0].files.map((file) => file.weight)).toEqual([400, 500, 700]);
  await expect(panel(page).getByText("Regular, Medium, Bold · Google Fonts")).toBeVisible();
  // Each weight was asked for once, though Regular was also the preview.
  expect((await shellCalls(page, "google_font")).filter((call) => call.family === "Real Font")).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("in the browser, Google Fonts point to the desktop app", async ({ page }) => {
  await openApp(page, "Brand kit");
  await setKit(page);
  await expect(page.getByText("Google Fonts are in the desktop app.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add from Google Fonts" })).toHaveCount(0);
});
