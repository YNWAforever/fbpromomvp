import { Pool, neonConfig } from "@neondatabase/serverless";
import { expect, it } from "vitest";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const expectedTables = [
  "approvals",
  "audit_events",
  "copy_candidates",
  "forecast_snapshots",
  "job_runs",
  "live_readings",
  "offer_templates",
  "promotions",
  "redemption_reports",
  "staff_users",
  "triggers",
  "venue_integrations",
  "venues",
  "weekly_reports",
];

it.skipIf(!process.env.TEST_DATABASE_URL)("finds all bounded MVP tables after migration", async () => {
  // This test intentionally reads TEST_DATABASE_URL directly. The owner/runtime
  // DATABASE_URL is never used by migration verification.
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    const result = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual(expectedTables);
  } finally {
    await pool.end();
  }
});
