import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const AUTH = path.join(__dirname, ".auth");

test.describe("keyboard", () => {
  test.use({ storageState: path.join(AUTH, "client.json") });

  test("skip link is the first stop and moves focus to the main content", async ({ page }) => {
    await page.goto("/tickets");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("focus indicator is visible on links and buttons", async ({ page }) => {
    await page.goto("/tickets");
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // logo link
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("a ticket can be raised using only the keyboard", async ({ page }) => {
    await page.goto("/tickets/new");
    await page.getByLabel("Product").focus();
    await page.keyboard.press("ArrowDown");
    await page.getByLabel("Summary").fill("Keyboard-only test ticket");
    await page.getByLabel("Details", { exact: true }).fill("Raised without using a mouse to check keyboard access.");
    await page.getByRole("button", { name: "Submit ticket" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Keyboard-only test ticket");
  });

  test("appearance switcher works and is announced as pressed", async ({ page }) => {
    await page.goto("/tickets");
    const dark = page.getByRole("button", { name: "Dark" });
    await dark.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Match device" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("survey choice can be made with arrow keys", async ({ page }) => {
    const f = JSON.parse(readFileSync(path.join(AUTH, "fixtures.json"), "utf8"));
    await page.goto(`/tickets/${f.resolvedTicket}`);
    const good = page.getByRole("radio", { name: "Good" });
    await good.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Okay" })).toBeChecked();
  });
});
