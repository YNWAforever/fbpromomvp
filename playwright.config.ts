import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/e2e/test-server.mjs",
    url: "http://localhost:3000",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/off_peak_rescue_test",
      AUTH_SECRET: "12345678901234567890123456789012",
      AUTH_GOOGLE_ID: "test-google-id",
      AUTH_GOOGLE_SECRET: "test-google-secret",
      ADMIN_EMAILS: "ops@example.com",
      N8N_HMAC_SECRET: "12345678901234567890123456789012",
      OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      APP_BASE_URL: "http://localhost:3000",
    },
    reuseExistingServer: false,
  },
});
