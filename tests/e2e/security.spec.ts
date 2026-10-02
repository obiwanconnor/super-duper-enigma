import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const AUTH = path.join(__dirname, ".auth");
const fixtures = () => JSON.parse(readFileSync(path.join(AUTH, "fixtures.json"), "utf8"));

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "light", "header checks run once");
});

function collectCspViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}

test("pages send security headers and a nonce-based CSP", async ({ page }) => {
  const res = await page.goto("/login");
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=63072000");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();

  // A fresh nonce on every request.
  const again = await page.request.get("/login");
  expect(again.headers()["content-security-policy"]).not.toBe(h["content-security-policy"]);
});

test.describe("no CSP violations", () => {
  test.use({ storageState: path.join(AUTH, "admin.json") });

  test("interactive staff pages run without CSP violations", async ({ page }) => {
    const violations = collectCspViolations(page);
    for (const url of ["/dashboard", `/tickets/${fixtures().openTicket}`, "/admin/notices/new", "/kb"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
    }
    // Exercise client-side code: the saved-reply picker and theme switch.
    await page.goto(`/tickets/${fixtures().openTicket}`);
    await page.waitForLoadState("networkidle");
    const reply = page.getByRole("region", { name: "Add a reply" });
    await reply.getByLabel("Saved reply").selectOption({ label: "Thanks, investigating" });
    await reply.getByRole("button", { name: "Insert" }).click();
    await expect(page.getByLabel("Message")).toHaveValue(/Hi Casey/);
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Match device" }).click();
    expect(violations).toEqual([]);
  });
});
