import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { promotions } from "../schema";

export type NewPromotion = typeof promotions.$inferInsert;

export async function createPromotion(db: DatabaseExecutor, values: NewPromotion) {
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

export const findPromotionById = getPromotion;
