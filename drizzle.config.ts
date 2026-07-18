import { defineConfig } from "drizzle-kit";
import { requireMigrationDatabaseUrl } from "./src/db/migration-config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: requireMigrationDatabaseUrl() },
  strict: true,
  verbose: true,
});