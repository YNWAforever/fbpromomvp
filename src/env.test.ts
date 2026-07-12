import { expect, it } from "vitest";
import { parseServerEnv } from "./env";

it("normalizes staff emails and permits absent providers in tests", () => {
  const value = parseServerEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://app:secret@example.test/app",
    AUTH_SECRET: "12345678901234567890123456789012",
    AUTH_GOOGLE_ID: "id",
    AUTH_GOOGLE_SECRET: "secret",
    ADMIN_EMAILS: "OPS@example.com, owner@example.com",
    N8N_HMAC_SECRET: "12345678901234567890123456789012",
    OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
  });
  expect(value.ADMIN_EMAILS).toEqual(["ops@example.com", "owner@example.com"]);
  expect(value.BESTTIME_PRIVATE_KEY).toBeUndefined();
});
