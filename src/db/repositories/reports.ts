import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { redemptionReports, weeklyReports } from "../schema";

export type NewRedemptionReport = typeof redemptionReports.$inferInsert;
export type NewWeeklyReport = typeof weeklyReports.$inferInsert;

export async function getRedemptionReport(db: DatabaseExecutor, promotionId: string) {
  const [report] = await db.select().from(redemptionReports).where(eq(redemptionReports.promotionId, promotionId)).limit(1);
  return report;
}

export async function upsertRedemptionReport(db: DatabaseExecutor, values: NewRedemptionReport) {
  const [report] = await db
    .insert(redemptionReports)
    .values(values)
    .onConflictDoUpdate({
      target: redemptionReports.promotionId,
      set: { count: values.count, note: values.note, revision: values.revision, updatedAt: values.updatedAt },
    })
    .returning();
  return report;
}

export async function createWeeklyReport(db: DatabaseExecutor, values: NewWeeklyReport) {
  const [report] = await db.insert(weeklyReports).values(values).returning();
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
