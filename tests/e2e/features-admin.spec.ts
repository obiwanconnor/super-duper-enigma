import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const AUTH = path.join(__dirname, ".auth");
const fixtures = () => JSON.parse(readFileSync(path.join(AUTH, "fixtures.json"), "utf8"));

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "light", "functional tests run once");
});

test.describe("client admin", () => {
  test.use({ storageState: path.join(AUTH, "client.json") });

  test("invite a colleague and deactivate them", async ({ page }) => {
    const email = `new-${Date.now()}@a11y.example`;
    await page.goto("/team");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(`Invited ${email}`);
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: `Deactivate ${email}` }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("deactivated");
    await expect(page.getByRole("row").filter({ hasText: email })).toContainText("Deactivated");
  });

  test("can't invite someone outside the organisation's domains", async ({ page }) => {
    await page.goto("/team");
    await page.getByLabel("Work email").fill("someone@elsewhere.example");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("a11y.example");
  });

  test("reports page and CSV download", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
    await expect(page.getByRole("table")).toContainText("Test Product");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
    const csv = readFileSync((await download.path())!, "utf8");
    expect(csv.split("\r\n")[0]).toContain("Ticket,Subject,Product");
    expect(csv).toContain("Report export fails for large date ranges");
  });

  test("ordinary clients can't reach team or reports", async ({ browser }) => {
    const db = new PrismaClient();
    await db.user.update({ where: { id: fixtures().clientId }, data: { orgAdmin: false } });
    const ctx = await browser.newContext({ storageState: path.join(AUTH, "client.json") });
    const page = await ctx.newPage();
    expect((await page.goto("/team"))?.status()).toBe(404);
    expect((await page.request.get("/reports/export")).status()).toBe(404);
    await db.user.update({ where: { id: fixtures().clientId }, data: { orgAdmin: true } });
    await ctx.close();
    await db.$disconnect();
  });
});

test.describe("service notices", () => {
  test("staff publish a notice and the affected client sees the banner", async ({ browser }) => {
    const title = `Login slowness ${Date.now()}`;
    const staff = await browser.newContext({ storageState: path.join(AUTH, "admin.json") });
    const sp = await staff.newPage();
    await sp.goto("/admin/notices/new");
    await sp.getByLabel("Title").fill(title);
    await sp.getByLabel("What clients need to know").fill("Sign-in is slow. We're investigating.");
    await sp.getByLabel("A11y Test Ltd – Test Product").check();
    await sp.getByRole("button", { name: "Publish notice" }).click();
    await expect(sp.getByRole("main").getByRole("status")).toContainText("Notice published");

    const client = await browser.newContext({ storageState: path.join(AUTH, "client.json") });
    const cp = await client.newPage();
    await cp.goto("/tickets");
    const banner = cp.getByRole("region", { name: "Service notices" });
    await expect(banner).toContainText(title);
    await banner.getByRole("link", { name: `Details: ${title}` }).click();
    await expect(cp.getByRole("heading", { level: 1 })).toHaveText(title);

    await sp.getByRole("button", { name: "Mark as resolved" }).click();
    await expect(sp.getByRole("main").getByRole("status")).toContainText("Notice resolved");
    await cp.goto("/tickets");
    await expect(cp.getByRole("region", { name: "Service notices" })).not.toContainText(title);
    await staff.close();
    await client.close();
  });

  test("client sees their ticket is part of a known issue", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: path.join(AUTH, "client.json") });
    const page = await ctx.newPage();
    await page.goto(`/tickets/${fixtures().openTicket}`);
    await expect(page.getByRole("region", { name: "Part of a known issue" })).toContainText("Report exports failing");
    await ctx.close();
  });
});

test.describe("sessions and limits", () => {
  test("staff idle for over 8 hours are signed out", async ({ browser }) => {
    const db = new PrismaClient();
    const token = `a11y-idle-${Date.now()}`;
    await db.session.create({
      data: { sessionToken: token, userId: fixtures().adminId, expires: new Date(Date.now() + 86_400_000), lastSeenAt: new Date(Date.now() - 9 * 3_600_000) },
    });
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?error=timeout/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("signed out");
    expect(await db.session.findUnique({ where: { sessionToken: token } })).toBeNull();
    await ctx.close();
    await db.$disconnect();
  });

  test("idle warning lets staff stay signed in", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: path.join(AUTH, "admin.json") });
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto("/dashboard");
    // Let the page hydrate so the idle timer is running before time moves.
    await page.waitForLoadState("networkidle");
    await page.clock.fastForward("07:56:00");
    await page.clock.runFor(20_000);
    const dialog = page.getByRole("alertdialog", { name: "Are you still there?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Stay signed in" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await ctx.close();
  });

  test("sign-in links are rate limited per email", async ({ page }) => {
    const email = `limit-${Date.now()}@a11y.example`;
    for (let i = 0; i < 6; i++) {
      await page.goto(`/login?email=${encodeURIComponent(email)}`);
      await page.getByRole("button", { name: "Email me a sign-in link" }).click();
      await page.waitForURL(/error=|check-email/);
    }
    await expect(page).toHaveURL(/error=rate-limited/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many sign-in attempts");
  });
});

test.describe("monthly summaries", () => {
  test("client admin downloads a tagged PDF summary", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: path.join(AUTH, "client.json") });
    const page = await ctx.newPage();
    await page.goto("/reports");
    const section = page.getByRole("region", { name: "Monthly summaries" });
    const first = section.getByRole("link").first();
    await expect(first).toHaveAccessibleName(/Download summary for .+ \(PDF\)/);
    const [download] = await Promise.all([page.waitForEvent("download"), first.click()]);
    const pdf = readFileSync((await download.path())!);
    const head = pdf.subarray(0, 8).toString("latin1");
    expect(head.startsWith("%PDF-1.7")).toBe(true);
    const raw = pdf.toString("latin1");
    expect(raw).toContain("/StructTreeRoot");
    expect(raw).toContain("/Lang (en-GB)");
    expect(raw).toMatch(/\/Marked true/);
    expect(raw).toMatch(/\/FontFile2/); // embedded font
    await ctx.close();
  });

  test("clients without the admin role can't download summaries", async ({ browser }) => {
    const db = new PrismaClient();
    await db.user.update({ where: { id: fixtures().clientId }, data: { orgAdmin: false } });
    const ctx = await browser.newContext({ storageState: path.join(AUTH, "client.json") });
    expect((await ctx.request.get("/reports/monthly/2026-09")).status()).toBe(404);
    await db.user.update({ where: { id: fixtures().clientId }, data: { orgAdmin: true } });
    await ctx.close();
    await db.$disconnect();
  });

  test("the monthly job sends once, with the PDF attached, to client admins and s6a admins", async ({ request }) => {
    const db = new PrismaClient();
    await db.monthlyReportRun.deleteMany({ where: { organizationId: fixtures().orgId } });
    const auth = { Authorization: `Bearer ${process.env.CRON_SECRET || "e2e-cron-secret"}` };

    expect((await request.get("/api/cron/monthly-reports?force=1")).status()).toBe(401);
    const first = await (await request.get("/api/cron/monthly-reports?force=1", { headers: auth })).json();
    const mine = first.results.find((r: { organizationId: string }) => r.organizationId === fixtures().orgId);
    expect(mine.sent).toBeGreaterThanOrEqual(2); // the client admin plus at least one s6a admin

    const again = await (await request.get("/api/cron/monthly-reports?force=1", { headers: auth })).json();
    expect(again.results.find((r: { organizationId: string }) => r.organizationId === fixtures().orgId).skipped).toBe("already-sent");

    const run = await db.monthlyReportRun.findFirst({ where: { organizationId: fixtures().orgId } });
    expect(run?.recipients).toBeGreaterThanOrEqual(2);
    await db.$disconnect();
  });
});
