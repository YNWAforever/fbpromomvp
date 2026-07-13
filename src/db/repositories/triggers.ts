import { desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { approvals, copyCandidates, liveReadings, triggers } from "../schema";
import { assertSameVenue } from "./ownership";

export type NewLiveReading = typeof liveReadings.$inferInsert;
export type NewTrigger = typeof triggers.$inferInsert;
export type NewCopyCandidate = typeof copyCandidates.$inferInsert;
export type NewApproval = typeof approvals.$inferInsert;

async function assertLiveReadingVenue(db: DatabaseExecutor, venueId: string, liveReadingId: string) {
  const [reading] = await db
    .select({ venueId: liveReadings.venueId })
    .from(liveReadings)
    .where(eq(liveReadings.id, liveReadingId))
    .limit(1);
  if (!reading) throw new Error(`live reading ${liveReadingId} not found`);
  assertSameVenue("live reading", venueId, reading.venueId);
}

async function assertApprovalRelations(
  db: DatabaseExecutor,
  values: Pick<NewApproval, "venueId" | "triggerId" | "selectedCandidateId">,
) {
  const [trigger] = await db
    .select({ venueId: triggers.venueId })
    .from(triggers)
    .where(eq(triggers.id, values.triggerId))
    .limit(1);
  if (!trigger) throw new Error(`trigger ${values.triggerId} not found`);
  assertSameVenue("trigger", values.venueId, trigger.venueId);

  if (values.selectedCandidateId) {
    const [candidate] = await db
      .select({ triggerId: copyCandidates.triggerId })
      .from(copyCandidates)
      .where(eq(copyCandidates.id, values.selectedCandidateId))
      .limit(1);
    if (!candidate) throw new Error(`copy candidate ${values.selectedCandidateId} not found`);
    if (candidate.triggerId !== values.triggerId) {
      throw new Error(`copy candidate ${values.selectedCandidateId} must belong to trigger ${values.triggerId}`);
    }
  }
}

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
  if (values.liveReadingId) await assertLiveReadingVenue(db, values.venueId, values.liveReadingId);
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
  await assertApprovalRelations(db, values);
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
  if (values.venueId || values.triggerId || values.selectedCandidateId) {
    const existing = await getApproval(db, id);
    if (!existing) throw new Error(`approval ${id} not found`);
    await assertApprovalRelations(db, {
      venueId: values.venueId ?? existing.venueId,
      triggerId: values.triggerId ?? existing.triggerId,
      selectedCandidateId: values.selectedCandidateId ?? existing.selectedCandidateId,
    });
  }
  const [approval] = await db.update(approvals).set(values).where(eq(approvals.id, id)).returning();
  return approval;
}

export const insertLiveReading = createLiveReading;
export const insertTrigger = createTrigger;