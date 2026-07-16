import { and, eq, gte, lt } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import { approvals, liveReadings, promotions, redemptionReports, triggers } from "@/db/schema";
import { createWeeklyReport, findWeeklyReport, updateWeeklyReport } from "@/db/repositories/reports";
import { listVenueIntegrations, listActiveVenues } from "@/db/repositories/venues";
import { aggregateWeeklyReport } from "@/domain/reports/aggregate";

async function listReadings(db: DatabaseExecutor, venueId: string, start: Date, end: Date) {
  return db.select({ observedAt: liveReadings.observedAt, delta: liveReadings.delta }).from(liveReadings)
    .where(and(eq(liveReadings.venueId, venueId), gte(liveReadings.observedAt, start), lt(liveReadings.observedAt, end)));
}
async function listTriggers(db: DatabaseExecutor, venueId: string, start: Date, end: Date) {
  return db.select({ decision: triggers.decision, delta: liveReadings.delta }).from(triggers)
    .leftJoin(liveReadings, eq(triggers.liveReadingId, liveReadings.id))
    .where(and(eq(triggers.venueId, venueId), gte(triggers.createdAt, start), lt(triggers.createdAt, end)));
}
async function listApprovals(db: DatabaseExecutor, venueId: string, start: Date, end: Date) {
  return db.select({ state: approvals.state }).from(approvals)
    .where(and(eq(approvals.venueId, venueId), gte(approvals.createdAt, start), lt(approvals.createdAt, end)));
}
async function listPromotions(db: DatabaseExecutor, venueId: string, start: Date, end: Date) {
  return db.select({ id: promotions.id, state: promotions.state, sentCount: promotions.sentCount }).from(promotions)
    .where(and(eq(promotions.venueId, venueId), gte(promotions.acceptedAt, start), lt(promotions.acceptedAt, end)));
}
async function listRedemptions(db: DatabaseExecutor, venueId: string, start: Date, end: Date) {
  return db.select({ count: redemptionReports.count }).from(redemptionReports)
    .innerJoin(promotions, eq(promotions.id, redemptionReports.promotionId))
    .where(and(eq(promotions.venueId, venueId), gte(promotions.acceptedAt, start), lt(promotions.acceptedAt, end)));
}

export type GenerateWeeklyRepositories = {
  listActiveVenues: typeof listActiveVenues;
  listReadings: typeof listReadings;
  listTriggers: typeof listTriggers;
  listApprovals: typeof listApprovals;
  listPromotions: typeof listPromotions;
  listRedemptions: typeof listRedemptions;
  listVenueIntegrations: typeof listVenueIntegrations;
  findWeeklyReport: typeof findWeeklyReport;
  createWeeklyReport: typeof createWeeklyReport;
  updateWeeklyReport: typeof updateWeeklyReport;
};

export async function generateWeeklyReports(input: {
  db: DatabaseExecutor;
  periodStart: Date;
  periodEnd: Date;
  repositories?: Partial<GenerateWeeklyRepositories>;
}) {
  if (!(input.periodStart < input.periodEnd)) throw new Error("weekly report period is invalid");
  const repository: GenerateWeeklyRepositories = {
    listActiveVenues, listReadings, listTriggers, listApprovals, listPromotions, listRedemptions,
    listVenueIntegrations, findWeeklyReport, createWeeklyReport, updateWeeklyReport,
    ...input.repositories,
  };
  const venues = await repository.listActiveVenues(input.db);
  const results: Array<{ venue: Record<string, unknown>; report: Record<string, unknown>; ownerMemberId?: string }> = [];
  for (const venue of venues) {
    const [readings, triggerRows, approvalRows, promotionRows, redemptionRows, integrations] = await Promise.all([
      repository.listReadings(input.db, venue.id, input.periodStart, input.periodEnd),
      repository.listTriggers(input.db, venue.id, input.periodStart, input.periodEnd),
      repository.listApprovals(input.db, venue.id, input.periodStart, input.periodEnd),
      repository.listPromotions(input.db, venue.id, input.periodStart, input.periodEnd),
      repository.listRedemptions(input.db, venue.id, input.periodStart, input.periodEnd),
      repository.listVenueIntegrations(input.db, venue.id),
    ]);
    const aggregate = aggregateWeeklyReport({ readings, triggers: triggerRows, approvals: approvalRows, promotions: promotionRows, redemptions: redemptionRows, averageOrderValue: venue.averageOrderValue });
    const { chartPoints, ...metrics } = aggregate;
    const existing = await repository.findWeeklyReport(input.db, venue.id, input.periodStart);
    const values = { venueId: venue.id, periodStart: input.periodStart, periodEnd: input.periodEnd, metrics, chartPoints };
    const report = existing
      ? await repository.updateWeeklyReport(input.db, existing.id, {
        ...values,
        state: existing.state === "sending"
          ? "sending"
          : existing.state === "sent" || Boolean(existing.providerMessageId) ? "sent" : "generated",
      })
      : await repository.createWeeklyReport(input.db, { ...values, state: "generated" });
    if (!report) throw new Error(`weekly report for venue ${venue.id} was not persisted`);
    const woztell = integrations.find((integration) => integration.provider === "woztell");
    const ownerReference = woztell?.metadata && typeof woztell.metadata === "object" ? (woztell.metadata as Record<string, unknown>).ownerReference : undefined;
    results.push({ venue: venue as unknown as Record<string, unknown>, report: report as unknown as Record<string, unknown>, ...(typeof ownerReference === "string" && ownerReference.trim() ? { ownerMemberId: ownerReference.trim() } : {}) });
  }
  return results;
}