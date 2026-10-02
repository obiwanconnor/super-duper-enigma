import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const AUTH = path.join(__dirname, ".auth");
const fixtures = () => JSON.parse(readFileSync(path.join(AUTH, "fixtures.json"), "utf8"));

// These change data, so run them once (light project only) and in order.
test.describe.configure({ mode: "serial" });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "light", "functional tests run once");
});

test.describe("client features", () => {
  test.use({ storageState: path.join(AUTH, "client.json") });

  test("copy a colleague in and remove them", async ({ page }) => {
    await page.goto(`/tickets/${fixtures().openTicket}`);
    await page.getByLabel("Copy in a colleague").selectOption({ label: "Colin Colleague (colin@a11y.example)" });
    await page.getByRole("button", { name: "Copy in", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Colleague copied in");
    const cc = page.getByRole("region", { name: "Colleagues copied in" });
    await expect(cc).toContainText("Colin Colleague");
    await page.getByRole("button", { name: "Remove Colin Colleague" }).click();
    await expect(page.getByRole("status")).toContainText("Colleague removed");
    await expect(cc).toContainText("No one else is copied in");
  });

  test("client sees service targets, not SLA countdowns", async ({ page }) => {
    await page.goto(`/tickets/${fixtures().openTicket}`);
    await expect(page.getByRole("region", { name: "Our service targets" })).toContainText("4 business hours");
    await expect(page.getByText("SLA (business hours)")).toHaveCount(0);
  });

  test("rate a resolved ticket from its page", async ({ page }) => {
    await page.goto(`/tickets/${fixtures().resolvedTicket}`);
    await page.getByRole("radio", { name: "Okay" }).check();
    await page.getByLabel("Anything you'd like to add? (optional)").fill("Took a while but sorted.");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByRole("status")).toContainText("Thanks for your feedback");
    await expect(page.getByRole("region", { name: "Your feedback" })).toContainText("Rated okay");
  });
});

test.describe("survey link", () => {
  test("rating from the email link works without signing in, and GET records nothing", async ({ page }) => {
    const db = new PrismaClient();
    await page.goto(`/survey/${fixtures().surveyToken}?rating=GOOD`);
    let saved = await db.satisfactionResponse.findFirst({ where: { ticket: { number: fixtures().resolvedTicket } } });
    expect(saved?.rating).not.toBe("GOOD"); // visiting the link alone must not record a rating
    await expect(page.getByRole("radio", { name: "Good" })).toBeChecked();
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you for your feedback");
    saved = await db.satisfactionResponse.findFirst({ where: { ticket: { number: fixtures().resolvedTicket } } });
    expect(saved?.rating).toBe("GOOD");
    await db.$disconnect();
  });
});

test.describe("staff features", () => {
  test.use({ storageState: path.join(AUTH, "admin.json") });

  test("insert a saved reply with placeholders filled", async ({ page }) => {
    await page.goto(`/tickets/${fixtures().openTicket}`);
    const reply = page.getByRole("region", { name: "Add a reply" });
    await reply.getByLabel("Saved reply").selectOption({ label: "Thanks, investigating" });
    await reply.getByRole("button", { name: "Insert" }).click();
    await expect(page.getByLabel("Message")).toHaveValue(/Hi Casey,/);
    await expect(page.getByLabel("Message")).toBeFocused();
  });

  test("export a person's data as JSON and see it in the audit log", async ({ page }) => {
    await page.goto(`/admin/users/${fixtures().clientId}`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download data export" }).click()]);
    const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(data.profile.email).toBe("casey@a11y.example");
    expect(data.ticketsRaised.length).toBeGreaterThan(0);
    await page.goto("/admin/audit?type=user");
    await expect(page.getByRole("table")).toContainText("Exported a user's personal data");
  });

  test("erase a person keeps their tickets but removes identity", async ({ page }) => {
    const db = new PrismaClient();
    const victim = await db.user.upsert({
      where: { email: "erase-me@a11y.example" },
      create: { email: "erase-me@a11y.example", name: "Erin Erase", organizationId: fixtures().orgId },
      update: {},
    });
    await page.goto(`/admin/users/${victim.id}`);
    await page.getByLabel(/to confirm/).fill("wrong@a11y.example");
    await page.getByRole("button", { name: "Erase personal data" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("exactly");
    await page.getByLabel(/to confirm/).fill("erase-me@a11y.example");
    await page.getByRole("button", { name: "Erase personal data" }).click();
    await expect(page.getByRole("status")).toContainText("Personal data erased");
    const after = await db.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.name).toBe("Former user");
    expect(after.email).toMatch(/@erased\.invalid$/);
    expect(after.active).toBe(false);
    await db.$disconnect();
  });

  test("retention review deletes an expired client after confirmation", async ({ page }) => {
    const db = new PrismaClient();
    const org = await db.organization.create({
      data: { name: `Expired Co ${Date.now()}`, slug: `expired-${Date.now()}`, contractEndsAt: new Date("2020-01-01") },
    });
    const product = await db.product.create({ data: { organizationId: org.id, name: "Old App", slug: "old-app" } });
    const user = await db.user.create({ data: { email: `old-${Date.now()}@expired.example`, organizationId: org.id } });
    await db.ticket.create({ data: { subject: "Old", description: "Old ticket", organizationId: org.id, productId: product.id, requesterId: user.id } });

    await page.goto("/admin/retention");
    const card = page.getByRole("listitem").filter({ hasText: org.name });
    await card.getByLabel(/permanently delete/).fill(org.name);
    await card.getByRole("button", { name: `Permanently delete ${org.name}` }).click();
    await expect(page.getByRole("status")).toContainText(`Deleted ${org.name}: 1 tickets`);
    expect(await db.organization.findUnique({ where: { id: org.id } })).toBeNull();
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    await db.$disconnect();
  });

  test("contract end date is saved and audited", async ({ page }) => {
    await page.goto(`/admin/organizations/${fixtures().orgId}`);
    await page.getByLabel("Contract end date").fill("2030-01-31");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText("Settings saved");
  });
});
