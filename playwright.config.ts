import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);

/**
 * Accessibility and smoke tests against a production build.
 *   npm run build && npm run test:e2e
 * Needs DATABASE_URL and AUTH_SECRET (global setup seeds fixtures and signs
 * test users in directly through the database).
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "light", use: { colorScheme: "light" } },
    { name: "dark", use: { colorScheme: "dark" } },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    env: { CRON_SECRET: process.env.CRON_SECRET || "e2e-cron-secret" },
    timeout: 120_000,
  },
});
