import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent as persistAuditEvent } from "@/db/repositories/audit";
import { getPromotion as findPromotion } from "@/db/repositories/promotions";
import { getRedemptionReport as findRedemption, upsertRedemptionReport as persistRedemption } from "@/db/repositories/reports";
import { verifyScopedToken } from "@/lib/security/signed-token";

export type RedemptionRecord = { promotionId: string; count: number; note: string | null; revision: number; updatedAt?: Date };
export type SubmitRedemptionInput = {
  db: DatabaseExecutor;
  token: string;
  secret: string;
  count: number;
  note?: string | null;
  now?: Date;
  repositories?: Partial<{
    getPromotion: typeof findPromotion;
    getRedemptionReport: typeof findRedemption;
    upsertRedemptionReport: typeof persistRedemption;
    appendAuditEvent: typeof persistAuditEvent;
  }>;
};
export type SubmitRedemptionResult = RedemptionRecord & { promotion: Record<string, unknown> };

type PromotionRecord = Record<string, unknown>;

type ExistingReport = { promotionId: string; count: number; note: string | null; revision: number; [key: string]: unknown };

function validateInput(count: number, note: string | null | undefined): string | null {
  if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error("redemption count must be an integer from 0 to 100000");
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 500)) throw new Error("redemption note must be at most 500 characters");
  return note === undefined ? null : note;
}

export async function submitRedemption(input: SubmitRedemptionInput): Promise<SubmitRedemptionResult> {
  const scoped = verifyScopedToken(input.token, input.secret, "promotion", input.now ?? new Date());
  if (!scoped) throw new Error("invalid or expired redemption token");

  const getPromotion = input.repositories?.getPromotion ?? findPromotion;
  const getRedemptionReport = input.repositories?.getRedemptionReport ?? findRedemption;
  const upsertRedemptionReport = input.repositories?.upsertRedemptionReport ?? persistRedemption;
  const appendAuditEvent = input.repositories?.appendAuditEvent ?? persistAuditEvent;
  const promotion = await getPromotion(input.db, scoped.subject) as PromotionRecord | undefined;
  if (!promotion) throw new Error("promotion not found");
  if (String(promotion.state) !== "accepted") throw new Error("promotion is not redeemable");

  const note = validateInput(input.count, input.note);
  const existing = await getRedemptionReport(input.db, scoped.subject) as ExistingReport | undefined;
  const unchanged = Boolean(existing && existing.count === input.count && (existing.note ?? null) === note);
  if (unchanged) return { ...(existing as RedemptionRecord), promotion };

  const revision = existing ? Number(existing.revision) + 1 : 1;
  const values = { promotionId: scoped.subject, count: input.count, note, revision, updatedAt: input.now ?? new Date() };
  const report = await upsertRedemptionReport(input.db, values as never) as RedemptionRecord | undefined;
  const result = report ?? values;
  await appendAuditEvent(input.db, {
    actorType: "owner",
    action: "redemption_reported",
    objectType: "redemption_report",
    objectId: scoped.subject,
    idempotencyKey: `redemption:${scoped.subject}:revision:${revision}`,
    metadata: { promotionId: scoped.subject, oldCount: existing?.count ?? null, oldNote: existing?.note ?? null, newCount: input.count, newNote: note, revision },
  });
  return { ...result, promotion };
}