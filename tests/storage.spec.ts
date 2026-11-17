import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fakeShell, openApp, PNG_2X2, shellCalls } from "./helpers";

const FONT = readFileSync(
  new URL("../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", import.meta.url),
).toString("base64");
const FONT_NAME = `${"c".repeat(64)}.woff2`;
const LOGO_NAME = `${"b".repeat(64)}.png`;

test.describe("kept on the desktop", () => {
  test("pattern colours you make come back next time", async ({ page }) => {
    await fakeShell(
      page,
      `(command) => command === "load_pattern_colors"
        ? JSON.stringify([
            { id: "pair_kept", base: "#112233", accent: "#AABBCC", source: "custom" },
            { id: "pair_bad", base: "red", accent: "#AABBCC" },
          ])
        : null`,
    );
    await openApp(page);
    await expect
      .poll(() => page.evaluate(`S.getState().customPatternPairs.map((pair) => pair.id)`))
      .toEqual(["pair_kept"]);

    await page.evaluate(`S.getState().addCustomPatternPair("#000000", "#FFFFFF")`);
    const calls = await shellCalls(page, "store_pattern_colors");
    const stored = JSON.parse(calls.at(-1)?.list as string) as { id: string }[];
    expect(stored.map((pair) => pair.id)[0]).toBe("pair_kept");
    expect(stored).toHaveLength(2);

    await page.evaluate(`S.getState().deleteCustomPatternPair("pair_kept")`);
    const after = JSON.parse((await shellCalls(page, "store_pattern_colors")).at(-1)?.list as string) as unknown[];
    expect(after).toHaveLength(1);
  });
});

test.describe("brand kit files", () => {
  test("fonts and logos are kept beside the kits file, which only names them", async ({ page }) => {
    const file = {
      version: 2,
      activeId: "bk_1",
      kits: [
        {
          id: "bk_1",
          name: "Kept",
          colors: [{ id: "c1", name: "Ink", hex: "#112233" }],
          logos: [{ id: "l1", name: "Mark", asset: LOGO_NAME }],
          fonts: [{ family: "Kept Mono", source: "upload", files: [{ weight: 400, asset: FONT_NAME }] }],
          heading: { family: "Kept Mono", weight: 400, colorId: null, letterSpacing: 0 },
          body: { family: "DM Sans", weight: 400, colorId: null, letterSpacing: 0 },
          images: { cornerShare: 0.04, shadow: true },
        },
      ],
    };
    // The desktop's kept files, by name, as base64.
    await fakeShell(
      page,
      `(() => {
        const kept = { ${JSON.stringify(FONT_NAME)}: ${JSON.stringify(FONT)}, ${JSON.stringify(LOGO_NAME)}: ${JSON.stringify(PNG_2X2)} };
        const bytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        return (command, args) => {
          if (command === "load_brand_kits") return ${JSON.stringify(JSON.stringify(file))};
          if (command === "load_brand_asset") {
            if (!kept[args.name]) throw "Layer couldn't find that file in your brand kits.";
            return bytes(kept[args.name]).buffer;
          }
          if (command === "store_brand_asset") {
            const name = (args[0] === 0x89 ? "d" : "e").repeat(64) + (args[0] === 0x89 ? ".png" : ".woff2");
            kept[name] = btoa(String.fromCharCode(...args));
            return name;
          }
          return null;
        };
      })()`,
    );
    const errors = await openApp(page);

    // Read back in as data: URLs, which the rest of the app takes.
    await expect
      .poll(() => page.evaluate(`S.getState().brandKits[0]?.logos[0]?.src ?? null`))
      .toBe(`data:image/png;base64,${PNG_2X2}`);
    await expect
      .poll(() =>
        page.evaluate(
          `[...document.fonts].some((f) => f.family.replace(/"/g, "") === "Kept Mono" && f.status === "loaded")`,
        ),
      )
      .toBe(true);

    // A change writes names, not the files again.
    await page.evaluate(`S.getState().updateBrandKit("bk_1", { name: "Kept again" })`);
    await expect.poll(async () => (await shellCalls(page, "store_brand_kits")).length).toBe(1);
    const written = (await shellCalls(page, "store_brand_kits"))[0].kits as string;
    const stored = JSON.parse(written) as {
      version: number;
      kits: { logos: Record<string, string>[]; fonts: { files: Record<string, unknown>[] }[] }[];
    };
    expect(stored.version).toBe(2);
    expect(stored.kits[0].logos[0]).toMatchObject({ asset: LOGO_NAME });
    expect(stored.kits[0].logos[0].src).toBeUndefined();
    expect(stored.kits[0].fonts[0].files[0]).toEqual({ weight: 400, asset: FONT_NAME });
    expect(written.length).toBeLessThan(2000);
    expect(await shellCalls(page, "store_brand_asset")).toHaveLength(0);

    // A new logo is kept as a file once.
    await page.evaluate(`(() => {
      const kit = S.getState().brandKits[0];
      S.getState().updateBrandKit("bk_1", {
        logos: [...kit.logos, { id: "l2", name: "Second", src: "data:image/png;base64,${PNG_2X2.slice(0, -4)}AAAA" }],
      });
    })()`);
    await expect.poll(async () => (await shellCalls(page, "store_brand_kits")).length).toBe(2);
    expect(await shellCalls(page, "store_brand_asset")).toHaveLength(1);
    const second = JSON.parse((await shellCalls(page, "store_brand_kits"))[1].kits as string) as {
      kits: { logos: Record<string, string>[] }[];
    };
    expect(second.kits[0].logos[1].asset).toBe(`${"d".repeat(64)}.png`);
    expect(errors).toEqual([]);
  });

  test("a kept file that's gone leaves the rest of the kit", async ({ page }) => {
    const file = {
      version: 2,
      activeId: "bk_1",
      kits: [{ id: "bk_1", name: "Partial", colors: [], logos: [{ id: "l1", name: "Gone", asset: LOGO_NAME }], fonts: [] }],
    };
    await fakeShell(
      page,
      `(command) => {
        if (command === "load_brand_kits") return ${JSON.stringify(JSON.stringify(file))};
        if (command === "load_brand_asset") throw "Layer couldn't find that file in your brand kits.";
        return null;
      }`,
    );
    await openApp(page);
    await expect.poll(() => page.evaluate(`S.getState().brandKits[0]?.name ?? null`)).toBe("Partial");
    expect(await page.evaluate(`S.getState().brandKits[0].logos.length`)).toBe(0);
  });
});
