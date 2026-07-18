import { expect, it } from "vitest";
import { parseServerEnv } from "./env";

const baseEnv = {
  DATABASE_URL: "postgresql://app:secret@example.test/app",
  AUTH_SECRET: "12345678901234567890123456789012",
  AUTH_GOOGLE_ID: "id",
  AUTH_GOOGLE_SECRET: "secret",
  ADMIN_EMAILS: "OPS@example.com, owner@example.com",
  N8N_HMAC_SECRET: "12345678901234567890123456789012",
  OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
} as const;

const productionProviders = {
  BESTTIME_PRIVATE_KEY: "besttime-private",
  BESTTIME_PUBLIC_KEY: "besttime-public",
  WOZTELL_ACCESS_TOKEN: "woztell-token",
  WOZTELL_APP_ID: "woztell-app",
  WOZTELL_CHANNEL_ID: "woztell-channel",
  WOZTELL_ENVIRONMENT_ID: "woztell-environment",
  WOZTELL_TREE_ID: "woztell-tree",
  WOZTELL_NODE_ID: "woztell-node",
  WOZTELL_WEBHOOK_SECRET: "woztell-webhook",
  WOZTELL_PRIORITY_GROUP_ID: "woztell-priority-group",
  OPENCODE_GO_API_KEY: "opencode-key",
} as const;

it("normalizes staff emails and permits absent providers in tests", () => {
  const value = parseServerEnv({
    ...baseEnv,
    NODE_ENV: "test",
  });

  expect(value.ADMIN_EMAILS).toEqual(["ops@example.com", "owner@example.com"]);
  expect(value.BESTTIME_PRIVATE_KEY).toBeUndefined();
  expect(value.APP_BASE_URL).toBe("http://localhost:3000");
});

it("uses VERCEL_ENV preview when it conflicts with production NODE_ENV", () => {
  const value = parseServerEnv({
    ...baseEnv,
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
  });

  expect(value.APP_BASE_URL).toBe("http://localhost:3000");
  expect(value.BESTTIME_PRIVATE_KEY).toBeUndefined();
});

it("uses VERCEL_ENV development when it conflicts with production NODE_ENV", () => {
  const value = parseServerEnv({
    ...baseEnv,
    NODE_ENV: "production",
    VERCEL_ENV: "development",
  });

  expect(value.APP_BASE_URL).toBe("http://localhost:3000");
  expect(value.BESTTIME_PRIVATE_KEY).toBeUndefined();
});

it("requires production credentials when VERCEL_ENV overrides NODE_ENV", () => {
  expect(() =>
    parseServerEnv({
      ...baseEnv,
      NODE_ENV: "test",
      VERCEL_ENV: "production",
    }),
  ).toThrow(/BESTTIME_PRIVATE_KEY/);
});

it("requires an explicit app URL in effective production", () => {
  expect(() =>
    parseServerEnv({
      ...baseEnv,
      ...productionProviders,
      NODE_ENV: "production",
    }),
  ).toThrow(/APP_BASE_URL/);
});

it("accepts an explicit non-local app URL in effective production", () => {
  const value = parseServerEnv({
    ...baseEnv,
    ...productionProviders,
    NODE_ENV: "test",
    VERCEL_ENV: "production",
    APP_BASE_URL: "https://rescue.example.com",
  });

  expect(value.APP_BASE_URL).toBe("https://rescue.example.com");
});

it("rejects localhost app URLs in effective production", () => {
  expect(() =>
    parseServerEnv({
      ...baseEnv,
      ...productionProviders,
      NODE_ENV: "production",
      APP_BASE_URL: "http://localhost:3000",
    }),
  ).toThrow(/APP_BASE_URL/);
});

it.each([
  "http://127.0.0.2:3000",
  "http://[::1]:3000",
  "http://[::ffff:127.0.0.1]:3000",
  "https://dashboard.localhost",
  "ftp://rescue.example.com",
])("rejects unsafe production app URL %s", (APP_BASE_URL) => {
  expect(() =>
    parseServerEnv({
      ...baseEnv,
      ...productionProviders,
      NODE_ENV: "production",
      APP_BASE_URL,
    }),
  ).toThrow(/APP_BASE_URL/);
});
it("accepts a migration-only database URL without replacing the runtime URL", () => {
  const value = parseServerEnv({
    ...baseEnv,
    NODE_ENV: "test",
    MIGRATION_DATABASE_URL: "postgresql://migration:secret@example.test/migration",
  });

  expect(value.DATABASE_URL).toBe(baseEnv.DATABASE_URL);
  expect(value.MIGRATION_DATABASE_URL).toBe(
    "postgresql://migration:secret@example.test/migration",
  );
});

it.each([
  ["TEST_DATABASE_URL", "http://bad"],
  ["TEST_DATABASE_URL", "mysql://bad"],
  ["MIGRATION_DATABASE_URL", "http://bad"],
  ["MIGRATION_DATABASE_URL", "mysql://bad"],
] as const)("rejects non-Postgres %s value %s", (field, value) => {
  expect(() =>
    parseServerEnv({
      ...baseEnv,
      NODE_ENV: "test",
      [field]: value,
    }),
  ).toThrow(new RegExp(field));
});

it("treats blank optional database URLs as undefined", () => {
  const value = parseServerEnv({
    ...baseEnv,
    NODE_ENV: "test",
    TEST_DATABASE_URL: "",
    MIGRATION_DATABASE_URL: "",
  });

  expect(value.TEST_DATABASE_URL).toBeUndefined();
  expect(value.MIGRATION_DATABASE_URL).toBeUndefined();
});
