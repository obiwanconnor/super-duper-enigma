import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Scans every page type with axe-core against WCAG 2.0, 2.1 and 2.2 at
 * levels A and AA. Runs once per Playwright project (light and dark).
 */

const AUTH = path.join(__dirname, ".auth");
const fixtures = () =>
  JSON.parse(readFileSync(path.join(AUTH, "fixtures.json"), "utf8")) as {
    openTicket: number;
    resolvedTicket: number;
    orgId: string;
    clientId: string;
    surveyToken: string;
    noticeId: string;
  };

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

async function expectAccessible(page: Page, include?: string, opts: { modal?: boolean } = {}) {
  const builder = new AxeBuilder({ page: page as never }).withTags(WCAG_TAGS);
  if (include) builder.include(include);
  const results = await builder.analyze();
  const summary = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1).join(" ")}`),
  }));
  expect(summary, `Accessibility violations on ${page.url()}`).toEqual([]);
  // Contrast checks axe couldn't resolve would otherwise pass silently.
  const unresolved = results.incomplete
    .filter((r) => r.id === "color-contrast")
    .flatMap((r) => r.nodes.map((n) => `${n.target.join(" ")}: ${n.any[0]?.message ?? ""}`))
    // Decorative glyphs (e.g. a hidden arrow) have no text to measure.
    .filter((m) => !m.includes("only non-text characters"))
    // A modal overlaps the page by design; its own colours are explicit (text-slate-900 on bg-white).
    .filter((m) => !(opts.modal && m.includes("partially overlaps")));
  expect(unresolved, `Unresolved contrast checks on ${page.url()}`).toEqual([]);
}

async function visit(page: Page, url: string) {
  const res = await page.goto(url);
  expect(res?.status(), `${url} should load`).toBeLessThan(400);
  await expect(page.locator("h1").first()).toBeVisible();
}

test.describe("signed out", () => {
  for (const url of ["/login", "/login?email=casey%40a11y.example", "/login?error=not-invited", "/login/check-email", "/login?error=timeout", "/privacy", "/accessibility"]) {
    test(`page ${url}`, async ({ page }) => {
      await visit(page, url);
      await expectAccessible(page);
    });
  }

  test("satisfaction survey from email link", async ({ page }) => {
    await visit(page, `/survey/${fixtures().surveyToken}?rating=GOOD`);
    await expectAccessible(page);
  });

  test("invalid survey link", async ({ page }) => {
    await visit(page, "/survey/not-a-token");
    await expectAccessible(page);
  });
});

test.describe("client", () => {
  test.use({ storageState: path.join(AUTH, "client.json") });

  const pages = () => {
    const f = fixtures();
    return [
      "/tickets",
      "/tickets?view=all",
      "/tickets/new",
      `/tickets/${f.openTicket}`,
      `/tickets/${f.resolvedTicket}`,
      "/kb",
      "/kb/a11y-exporting-reports",
      "/team",
      "/reports",
      "/reports?days=365",
      `/notices/${f.noticeId}`,
    ];
  };

  for (const i of [...Array(11).keys()]) {
    test(`client page ${i}`, async ({ page }) => {
      const url = pages()[i];
      await visit(page, url);
      await expectAccessible(page);
    });
  }
});

test.describe("staff", () => {
  test.use({ storageState: path.join(AUTH, "admin.json") });

  const pages = () => {
    const f = fixtures();
    return [
      "/dashboard",
      "/tickets",
      `/tickets/${f.openTicket}`,
      `/tickets/${f.resolvedTicket}`,
      "/kb",
      "/admin/articles",
      "/admin/articles/new",
      "/admin/canned",
      "/admin/organizations",
      `/admin/organizations/${f.orgId}`,
      "/admin/staff",
      `/admin/users/${f.clientId}`,
      "/admin/audit",
      "/admin/retention",
      "/admin/notices",
      "/admin/notices/new",
      `/admin/notices/${f.noticeId}`,
      `/notices/${f.noticeId}`,
    ];
  };

  for (const i of [...Array(18).keys()]) {
    test(`staff page ${i}`, async ({ page }) => {
      const url = pages()[i];
      await visit(page, url);
      await expectAccessible(page);
    });
  }
});

test.describe("dialogs", () => {
  test.use({ storageState: path.join(AUTH, "admin.json") });

  test("idle warning dialog is accessible", async ({ page }) => {
    await page.clock.install();
    await page.goto("/dashboard");
    await page.clock.fastForward("07:56:00");
    await page.clock.runFor(20_000);
    await expect(page.getByRole("alertdialog", { name: "Are you still there?" })).toBeVisible();
    // Content behind the modal backdrop is inert, so scan the dialog itself.
    await expectAccessible(page, "dialog", { modal: true });
  });
});
