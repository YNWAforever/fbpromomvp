import { and, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { auditEvents } from "../schema";

export type NewAuditEvent = typeof auditEvents.$inferInsert;

/** Append once for an idempotency key; concurrent retries reuse the stored event. */
export async function appendAuditEvent(db: DatabaseExecutor, values: NewAuditEvent) {
  const [event] = await db
    .insert(auditEvents)
    .values(values)
    .onConflictDoNothing({ target: auditEvents.idempotencyKey })
    .returning();
  if (event) return event;
  if (values.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.idempotencyKey, values.idempotencyKey))
      .limit(1);
    return existing;
  }
  return undefined;
}

export async function findAuditEventByIdempotencyKey(db: DatabaseExecutor, idempotencyKey: string) {
  const [event] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  return event;
}

export async function listAuditEvents(db: DatabaseExecutor, objectType: string, objectId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.objectType, objectType), eq(auditEvents.objectId, objectId)))
    .orderBy(desc(auditEvents.createdAt));
}

export const createAuditEvent = appendAuditEvent;
