import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { redemptionReports, weeklyReports } from "../schema";

export type NewRedemptionReport = typeof redemptionReports.$inferInsert;
export type NewWeeklyReport = typeof weeklyReports.$inferInsert;

type RedemptionValues = { count: number; note?: string | null; revision?: number };
type ExistingRedemption = { count: number; note: string | null; revision: number };

export function nextRedemptionRevision(
  existing: ExistingRedemption | undefined,
  incoming: RedemptionValues,
): { changed: boolean; revision: number } {
  if (!existing) {
    if (incoming.revision !== undefined && incoming.revision !== 1) {
      throw new Error("first redemption revision must be 1");
    }
    return { changed: true, revision: 1 };
  }

  const changed = existing.count !== incoming.count || (incoming.note ?? null) !== (existing.note ?? null);
  if (!changed) return { changed: false, revision: existing.revision };

  const expected = existing.revision + 1;
  if (incoming.revision !== undefined && incoming.revision !== expected) {
    throw new Error("revision must advance monotonically");
  }
  return { changed: true, revision: expected };
}

export function resolveConcurrentFirstRedemption<T extends ExistingRedemption>(
  raced: T | undefined,
  incoming: RedemptionValues,
): T {
  if (!raced) throw new Error("redemption report insert lost a concurrent write");
  if (
    raced.revision !== 1
    || raced.count !== incoming.count
    || (raced.note ?? null) !== (incoming.note ?? null)
  ) {
    throw new Error("redemption report changed concurrently; retry with the latest revision");
  }
  return raced;
}
export async function getRedemptionReport(db: DatabaseExecutor, promotionId: string) {
  const [report] = await db.select().from(redemptionReports).where(eq(redemptionReports.promotionId, promotionId)).limit(1);
  return report;
}

export async function upsertRedemptionReport(db: DatabaseExecutor, values: NewRedemptionReport) {
  const existing = await getRedemptionReport(db, values.promotionId);
  const next = nextRedemptionRevision(existing, values);
  if (existing && !next.changed) return existing;

  const now = new Date();
  if (!existing) {
    const [report] = await db
      .insert(redemptionReports)
      .values({ ...values, revision: next.revision, updatedAt: values.updatedAt ?? now })
      .onConflictDoNothing({ target: redemptionReports.promotionId })
      .returning();
    if (report) return report;
    const raced = await getRedemptionReport(db, values.promotionId);
    return resolveConcurrentFirstRedemption(raced, values);
  }

  const [report] = await db
    .update(redemptionReports)
    .set({ count: values.count, note: values.note, revision: next.revision, updatedAt: now })
    .where(and(eq(redemptionReports.id, existing.id), eq(redemptionReports.revision, existing.revision)))
    .returning();
  if (!report) throw new Error("redemption report changed concurrently; retry with the latest revision");
  return report;
}

export async function createWeeklyReport(db: DatabaseExecutor, values: NewWeeklyReport) {
  const [report] = await db.insert(weeklyReports).values(values).returning();
  return report;
}

export async function getWeeklyReport(db: DatabaseExecutor, id: string) {
  const [report] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, id)).limit(1);
  return report;
}
export async function claimWeeklyReportDelivery(db: DatabaseExecutor, id: string) {
  const [report] = await db
    .update(weeklyReports)
    .set({ state: "sending" })
    .where(and(
      eq(weeklyReports.id, id),
      inArray(weeklyReports.state, ["generated", "incomplete", "failed"]),
    ))
    .returning();
  return report;
}
export async function findWeeklyReport(db: DatabaseExecutor, venueId: string, periodStart: Date) {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.venueId, venueId), eq(weeklyReports.periodStart, periodStart)))
    .limit(1);
  return report;
}

export async function updateWeeklyReport(db: DatabaseExecutor, id: string, values: Partial<NewWeeklyReport>) {
  const [report] = await db.update(weeklyReports).set(values).where(eq(weeklyReports.id, id)).returning();
  return report;
}
