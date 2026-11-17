import { expect, test } from "@playwright/test";
import { fakeShell, openApp, shellCalls } from "./helpers";

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
