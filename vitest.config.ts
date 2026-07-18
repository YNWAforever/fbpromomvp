import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    env: {
      DATABASE_URL: "postgresql://test:test@example.test/test",
      AUTH_SECRET: "12345678901234567890123456789012",
      AUTH_GOOGLE_ID: "test-google-id",
      AUTH_GOOGLE_SECRET: "test-google-secret",
      ADMIN_EMAILS: "ops@example.com",
      N8N_HMAC_SECRET: "12345678901234567890123456789012",
      OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      APP_BASE_URL: "http://localhost:3000",
    },
  },
});
