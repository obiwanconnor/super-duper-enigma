import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";

const AUTH = path.join(__dirname, ".auth");
const OUT = process.env.SCREENSHOT_DIR;

test.skip(!OUT, "screenshots only when SCREENSHOT_DIR is set");
test.use({ storageState: path.join(AUTH, "admin.json"), viewport: { width: 1280, height: 900 } });

test("capture", async ({ page }, info) => {
  const f = JSON.parse(readFileSync(path.join(AUTH, "fixtures.json"), "utf8"));
  for (const [name, url] of [
    ["ticket", `/tickets/${f.openTicket}`],
    ["dashboard", "/dashboard"],
    ["org", `/admin/organizations/${f.orgId}`],
  ]) {
    await page.goto(url);
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png`, fullPage: true });
  }
});

test.describe("client screens", () => {
  test.use({ storageState: path.join(AUTH, "client.json") });
  test("capture client", async ({ page }, info) => {
    for (const [name, url] of [
      ["client-tickets", "/tickets"],
      ["client-reports", "/reports"],
    ]) {
      await page.goto(url);
      await page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png`, fullPage: true });
    }
    await page.clock.install();
    await page.goto("/tickets");
    await page.clock.fastForward("167:56:00");
    await page.clock.runFor(20_000);
    await page.screenshot({ path: `${OUT}/${info.project.name}-idle.png` });
  });
});
