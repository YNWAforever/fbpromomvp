import { expect, it } from "vitest";
import * as schema from "./schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("exports all bounded MVP records", () => {
  expect(Object.keys(schema).sort()).toEqual([
    "approvals",
    "auditEvents",
    "copyCandidates",
    "forecastSnapshots",
    "jobRuns",
    "liveReadings",
    "offerTemplates",
    "promotions",
    "redemptionReports",
    "staffUsers",
    "triggers",
    "venueIntegrations",
    "venues",
    "weeklyReports",
  ]);
});

it("keeps audit identifier types consistent between Drizzle and SQL", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_initial.sql"), "utf8");
  expect(migration).toMatch(/"actor_id" uuid/);
  expect(migration).toMatch(/"object_id" uuid/);
  expect(schema.auditEvents.actorId.columnType).toBe("PgUUID");
  expect(schema.auditEvents.objectId.columnType).toBe("PgUUID");
});

it("declares composite ownership keys for cross-venue relations", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_initial.sql"), "utf8");
  expect(migration).toMatch(/FOREIGN KEY \("venue_id","live_reading_id"\)/);
  expect(migration).toMatch(/FOREIGN KEY \("trigger_id","selected_candidate_id"\)/);
  expect(migration).toMatch(/FOREIGN KEY \("venue_id","approval_id"\)/);
  expect(schema.approvals.venueId).toBeDefined();
});
it("declares bounded approval and promotion validity windows", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_initial.sql"), "utf8");
  expect(migration).toMatch(/approvals_expiry_window_check/);
  expect(migration).toMatch(/promotions_valid_window_check/);
});
it("creates referenced composite indexes before foreign keys in the migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_initial.sql"), "utf8");
  expect(migration.indexOf('CREATE UNIQUE INDEX "live_readings_venue_id_idx"')).toBeGreaterThanOrEqual(0);
  expect(migration.indexOf('CREATE UNIQUE INDEX "triggers_venue_id_idx"')).toBeGreaterThanOrEqual(0);
  expect(migration.indexOf('CREATE UNIQUE INDEX "copy_candidates_trigger_id_idx"')).toBeGreaterThanOrEqual(0);
  expect(migration.indexOf('CREATE UNIQUE INDEX "approvals_venue_id_idx"')).toBeGreaterThanOrEqual(0);
  expect(migration.indexOf('CREATE UNIQUE INDEX "live_readings_venue_id_idx"')).toBeLessThan(
    migration.indexOf('triggers_venue_live_reading_fk'),
  );
  expect(migration.indexOf('CREATE UNIQUE INDEX "triggers_venue_id_idx"')).toBeLessThan(
    migration.indexOf('approvals_venue_trigger_fk'),
  );
  expect(migration.indexOf('CREATE UNIQUE INDEX "copy_candidates_trigger_id_idx"')).toBeLessThan(
    migration.indexOf('approvals_trigger_candidate_fk'),
  );
  expect(migration.indexOf('CREATE UNIQUE INDEX "approvals_venue_id_idx"')).toBeLessThan(
    migration.indexOf('promotions_venue_approval_fk'),
  );
});