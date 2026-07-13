import { and, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { auditEvents } from "../schema";

export type NewAuditEvent = typeof auditEvents.$inferInsert;

export async function appendAuditEvent(db: DatabaseExecutor, values: NewAuditEvent) {
  const [event] = await db.insert(auditEvents).values(values).returning();
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

