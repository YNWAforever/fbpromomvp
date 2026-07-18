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

async function withTestDatabase<T>(work: (pool: Pool) => Promise<T>) {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) return undefined;
  const pool = new Pool({ connectionString });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

it.skipIf(!process.env.TEST_DATABASE_URL)("finds all bounded MVP tables after migration", async () => {
  const tables = await withTestDatabase(async (pool) => {
    const result = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    );
    return result.rows.map((row) => row.table_name);
  });
  expect(tables).toEqual(expectedTables);
});

it.skipIf(!process.env.TEST_DATABASE_URL)("verifies typed audit columns and venue ownership constraints", async () => {
  const result = await withTestDatabase(async (pool) => {
    const columns = await pool.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type
       from information_schema.columns
       where table_schema = 'public' and table_name = 'audit_events'
         and column_name in ('actor_id', 'object_id')
       order by column_name`,
    );
    const constraints = await pool.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where conrelid in ('triggers'::regclass, 'approvals'::regclass, 'promotions'::regclass)
         and conname in (
           'triggers_venue_live_reading_fk',
           'approvals_venue_trigger_fk',
           'approvals_trigger_candidate_fk',
           'promotions_venue_approval_fk'
         )
       order by conname`,
    );
    const checks = await pool.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where conrelid in ('approvals'::regclass, 'promotions'::regclass)
         and conname in ('approvals_expiry_window_check', 'promotions_valid_window_check')
       order by conname`,
    );
    return {
      columns: columns.rows,
      constraints: constraints.rows.map((row) => row.conname),
      checks: checks.rows.map((row) => row.conname),
    };
  });

  expect(result?.columns).toEqual([
    { column_name: "actor_id", data_type: "uuid" },
    { column_name: "object_id", data_type: "uuid" },
  ]);
  expect(result?.constraints).toEqual([
    "approvals_trigger_candidate_fk",
    "approvals_venue_trigger_fk",
    "promotions_venue_approval_fk",
    "triggers_venue_live_reading_fk",
  ]);
  expect(result?.checks).toEqual(["approvals_expiry_window_check", "promotions_valid_window_check"]);
});