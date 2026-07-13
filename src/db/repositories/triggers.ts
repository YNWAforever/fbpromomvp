import { desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { approvals, copyCandidates, liveReadings, triggers } from "../schema";

export type NewLiveReading = typeof liveReadings.$inferInsert;
export type NewTrigger = typeof triggers.$inferInsert;
export type NewCopyCandidate = typeof copyCandidates.$inferInsert;
export type NewApproval = typeof approvals.$inferInsert;

export async function createLiveReading(db: DatabaseExecutor, values: NewLiveReading) {
  const [reading] = await db
    .insert(liveReadings)
    .values(values)
    .onConflictDoUpdate({
      target: [liveReadings.venueId, liveReadings.observedAt],
      set: {
        forecastedBusyness: values.forecastedBusyness,
        liveBusyness: values.liveBusyness,
        delta: values.delta,
        status: values.status,
        errorCode: values.errorCode,
        providerRequestId: values.providerRequestId,
      },
    })
    .returning();
  return reading;
}

export async function getLiveReading(db: DatabaseExecutor, id: string) {
  const [reading] = await db.select().from(liveReadings).where(eq(liveReadings.id, id)).limit(1);
  return reading;
}

export async function listLiveReadings(db: DatabaseExecutor, venueId: string, limit = 100) {
  return db
    .select()
    .from(liveReadings)
    .where(eq(liveReadings.venueId, venueId))
    .orderBy(desc(liveReadings.observedAt))
    .limit(limit);
}

export async function createTrigger(db: DatabaseExecutor, values: NewTrigger) {
  const [trigger] = await db
    .insert(triggers)
    .values(values)
    .onConflictDoNothing({ target: triggers.idempotencyKey })
    .returning();
  return trigger ?? findTriggerByIdempotencyKey(db, values.idempotencyKey);
}

export async function findTriggerByIdempotencyKey(db: DatabaseExecutor, idempotencyKey: string) {
  const [trigger] = await db.select().from(triggers).where(eq(triggers.idempotencyKey, idempotencyKey)).limit(1);
  return trigger;
}

export async function listTriggersForVenue(db: DatabaseExecutor, venueId: string) {
  return db.select().from(triggers).where(eq(triggers.venueId, venueId)).orderBy(desc(triggers.createdAt));
}

export async function createCopyCandidate(db: DatabaseExecutor, values: NewCopyCandidate) {
  const [candidate] = await db.insert(copyCandidates).values(values).returning();
  return candidate;
}

export async function createCopyCandidates(db: DatabaseExecutor, values: NewCopyCandidate[]) {
  return values.length ? db.insert(copyCandidates).values(values).returning() : [];
}

export async function listCopyCandidates(db: DatabaseExecutor, triggerId: string) {
  return db.select().from(copyCandidates).where(eq(copyCandidates.triggerId, triggerId)).orderBy(copyCandidates.createdAt);
}

export async function createApproval(db: DatabaseExecutor, values: NewApproval) {
  const [approval] = await db.insert(approvals).values(values).returning();
  return approval;
}

export async function getApproval(db: DatabaseExecutor, id: string) {
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  return approval;
}

export async function findApprovalByTriggerId(db: DatabaseExecutor, triggerId: string) {
  const [approval] = await db.select().from(approvals).where(eq(approvals.triggerId, triggerId)).limit(1);
  return approval;
}

export async function updateApproval(db: DatabaseExecutor, id: string, values: Partial<NewApproval>) {
  const [approval] = await db.update(approvals).set(values).where(eq(approvals.id, id)).returning();
  return approval;
}

export const insertLiveReading = createLiveReading;
export const insertTrigger = createTrigger;

