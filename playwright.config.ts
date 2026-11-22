import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ADMIN_SESSION_SECRET:
        "test-admin-session-secret-at-least-32-chars-long-e2e-only",
      ADMIN_PASSWORD_HASH:
        "scrypt$16384$8$1$nMeV081x8anx1PxRZ52mbQ==$RSEgqFBJdJR5leKNzO92MqZmNj6y6rdzumNW7xwf1Dk=",
    },
  },
});
