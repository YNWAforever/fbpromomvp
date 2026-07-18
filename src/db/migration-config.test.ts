import { describe, expect, it } from "vitest";
import { requireMigrationDatabaseUrl } from "./migration-config";

describe("migration database configuration", () => {
  it("requires a migration-only connection string", () => {
    expect(() => requireMigrationDatabaseUrl({ DATABASE_URL: "postgresql://runtime" })).toThrow(
      "MIGRATION_DATABASE_URL is required",
    );
  });

  it("returns MIGRATION_DATABASE_URL without falling back to runtime URL", () => {
    expect(
      requireMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://runtime",
        MIGRATION_DATABASE_URL: "postgresql://migration",
      }),
    ).toBe("postgresql://migration");
  });
});