import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Proves the scanner is live: a page with known failures must be reported.
test("axe reports known violations", async ({ page }) => {
  await page.setContent(`<html><body><main><img src="x.png"><input type="text"><p style="color:#bbb;background:#fff">low contrast</p></main></body></html>`);
  const results = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const ids = results.violations.map((v) => v.id);
  expect(ids).toEqual(expect.arrayContaining(["image-alt", "label", "color-contrast"]));
});

test("axe evaluates real pages", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.passes.length).toBeGreaterThan(10);
  console.log(`login: ${results.passes.length} rules passed, ${results.incomplete.length} need review: ${results.incomplete.map((i) => i.id).join(", ")}`);
});
