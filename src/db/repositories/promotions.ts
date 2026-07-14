import { and, count, desc, eq, gte, gt, inArray, lte, or } from "drizzle-orm";
import { DateTime } from "luxon";
import type { DatabaseExecutor } from "../client";
import { approvals, promotions } from "../schema";
import { assertSameVenue } from "./ownership";

export type NewPromotion = typeof promotions.$inferInsert;

async function assertApprovalVenue(db: DatabaseExecutor, venueId: string, approvalId: string) {
  const [approval] = await db
    .select({ venueId: approvals.venueId })
    .from(approvals)
    .where(eq(approvals.id, approvalId))
    .limit(1);
  if (!approval) throw new Error(`approval ${approvalId} not found`);
  assertSameVenue("approval", venueId, approval.venueId);
}

export async function createPromotion(db: DatabaseExecutor, values: NewPromotion) {
  await assertApprovalVenue(db, values.venueId, values.approvalId);
  const [promotion] = await db
    .insert(promotions)
    .values(values)
    .onConflictDoNothing({ target: promotions.approvalId })
    .returning();
  return promotion;
}

export async function getPromotion(db: DatabaseExecutor, id: string) {
  const [promotion] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  return promotion;
}

export async function findPromotionByApprovalId(db: DatabaseExecutor, approvalId: string) {
  const [promotion] = await db.select().from(promotions).where(eq(promotions.approvalId, approvalId)).limit(1);
  return promotion;
}

export async function updatePromotion(db: DatabaseExecutor, id: string, values: Partial<NewPromotion>) {
  if (values.venueId || values.approvalId) {
    const existing = await getPromotion(db, id);
    if (!existing) throw new Error(`promotion ${id} not found`);
    await assertApprovalVenue(db, values.venueId ?? existing.venueId, values.approvalId ?? existing.approvalId);
  }
  const [promotion] = await db.update(promotions).set(values).where(eq(promotions.id, id)).returning();
  return promotion;
}

export async function listAcceptedPromotions(db: DatabaseExecutor, venueId: string, from: Date, until: Date) {
  return db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.venueId, venueId),
        eq(promotions.state, "accepted"),
        gte(promotions.acceptedAt, from),
        lte(promotions.acceptedAt, until),
      ),
    )
    .orderBy(desc(promotions.acceptedAt));
}

/** Count accepted promotions in the venue-local day and Monday-based week. */
export async function getAcceptedPromotionCounts(db: DatabaseExecutor, venueId: string, now: Date, timezone = "Asia/Hong_Kong") {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const dayStart = local.startOf("day").toUTC().toJSDate();
  const weekStart = local.startOf("week").toUTC().toJSDate();
  const [row] = await db
    .select({ count: count() })
    .from(promotions)
    .where(
      and(
        eq(promotions.venueId, venueId),
        eq(promotions.state, "accepted"),
        gte(promotions.acceptedAt, weekStart),
        lte(promotions.acceptedAt, now),
      ),
    );
  const week = Number(row?.count ?? 0);
  const dayRows = await db
    .select({ count: count() })
    .from(promotions)
    .where(
      and(
        eq(promotions.venueId, venueId),
        eq(promotions.state, "accepted"),
        gte(promotions.acceptedAt, dayStart),
        lte(promotions.acceptedAt, now),
      ),
    );
  return { today: Number(dayRows[0]?.count ?? 0), week };
}

/** True while an approval or currently valid promotion occupies the venue. */
export async function hasPendingPromotion(db: DatabaseExecutor, venueId: string, now: Date) {
  const [pendingApproval] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.venueId, venueId), eq(approvals.state, "pending"), gt(approvals.expiresAt, now)))
    .limit(1);
  if (pendingApproval) return true;

  const [activePromotion] = await db
    .select({ id: promotions.id })
    .from(promotions)
    .where(
      and(
        eq(promotions.venueId, venueId),
        or(
          eq(promotions.state, "pending"),
          and(
            inArray(promotions.state, ["active", "accepted"]),
            lte(promotions.validFrom, now),
            gte(promotions.validUntil, now),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(activePromotion);
}

export const findPromotionById = getPromotion;
