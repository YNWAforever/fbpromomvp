import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Task 4 idempotency migration upgrade path", () => {
  const root = process.cwd();
  const initialSql = readFileSync(resolve(root, "drizzle/0000_initial.sql"), "utf8");
  const forwardSql = readFileSync(resolve(root, "drizzle/0001_sparkling_callisto.sql"), "utf8");
  const auditForwardSql = readFileSync(resolve(root, "drizzle/0002_burly_maverick.sql"), "utf8");
  const task6ForwardSql = readFileSync(resolve(root, "drizzle/0003_worthless_hammerhead.sql"), "utf8");
  const initialSnapshot = JSON.parse(readFileSync(resolve(root, "drizzle/meta/0000_snapshot.json"), "utf8")) as { tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }> };
  const forwardSnapshot = JSON.parse(readFileSync(resolve(root, "drizzle/meta/0001_snapshot.json"), "utf8")) as { tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }> };
  const auditSnapshot = JSON.parse(readFileSync(resolve(root, "drizzle/meta/0002_snapshot.json"), "utf8")) as { tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }> };
  const task6Snapshot = JSON.parse(readFileSync(resolve(root, "drizzle/meta/0003_snapshot.json"), "utf8")) as { tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }> };
  const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };

  it("keeps the applied initial migration immutable and ships additions as forward migrations", () => {
    expect(initialSql).not.toContain('"request_key" text');
    expect(initialSql).not.toContain('"idempotency_key" text,');
    expect(forwardSql).toContain('ALTER TABLE "forecast_snapshots" ADD COLUMN "request_key" text');
    expect(forwardSql).toContain('ALTER TABLE "venues" ADD COLUMN "idempotency_key" text');
    expect(forwardSql).toContain('CREATE UNIQUE INDEX "forecast_snapshots_venue_request_idx"');
    expect(forwardSql).toContain('CREATE UNIQUE INDEX "venues_idempotency_key_idx"');
    expect(auditForwardSql).toContain('ALTER TABLE "audit_events" ADD COLUMN "idempotency_key" text');
    expect(auditForwardSql).toContain('CREATE UNIQUE INDEX "audit_events_idempotency_key_idx"');
    expect(task6ForwardSql).toContain('ALTER TABLE "copy_candidates" ADD COLUMN "ordinal" integer');
    expect(task6ForwardSql).toContain('ALTER TABLE "copy_candidates" ADD COLUMN "version" integer DEFAULT 1 NOT NULL');
    expect(task6ForwardSql).toContain('CREATE UNIQUE INDEX "copy_candidates_trigger_version_ordinal_idx"');
  });

  it("records the upgrade in Drizzle journal and snapshots", () => {
    expect(journal.entries.map(({ idx, tag }) => ({ idx, tag }))).toEqual([
      { idx: 0, tag: "0000_initial" },
      { idx: 1, tag: "0001_sparkling_callisto" },
      { idx: 2, tag: "0002_burly_maverick" },
      { idx: 3, tag: "0003_worthless_hammerhead" },
    ]);
    expect(initialSnapshot.tables["public.venues"]?.columns).not.toHaveProperty("idempotency_key");
    expect(initialSnapshot.tables["public.forecast_snapshots"]?.columns).not.toHaveProperty("request_key");
    expect(forwardSnapshot.tables["public.venues"]?.columns).toHaveProperty("idempotency_key");
    expect(forwardSnapshot.tables["public.forecast_snapshots"]?.columns).toHaveProperty("request_key");
    expect(forwardSnapshot.tables["public.venues"]?.indexes).toHaveProperty("venues_idempotency_key_idx");
    expect(forwardSnapshot.tables["public.forecast_snapshots"]?.indexes).toHaveProperty("forecast_snapshots_venue_request_idx");
    expect(auditSnapshot.tables["public.audit_events"]?.columns).toHaveProperty("idempotency_key");
    expect(auditSnapshot.tables["public.audit_events"]?.indexes).toHaveProperty("audit_events_idempotency_key_idx");
    expect(task6Snapshot.tables["public.copy_candidates"]?.columns).toHaveProperty("ordinal");
    expect(task6Snapshot.tables["public.copy_candidates"]?.columns).toHaveProperty("version");
    expect(task6Snapshot.tables["public.copy_candidates"]?.indexes).toHaveProperty("copy_candidates_trigger_version_ordinal_idx");
  });
});