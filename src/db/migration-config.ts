/** Return the migration-only database URL and refuse runtime credentials. */
export function requireMigrationDatabaseUrl(input: Record<string, string | undefined> = process.env): string {
  const value = input.MIGRATION_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "MIGRATION_DATABASE_URL is required for Drizzle migrations; refusing to fall back to DATABASE_URL",
    );
  }
  return value;
}