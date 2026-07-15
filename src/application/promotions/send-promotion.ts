import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent } from "@/db/repositories/audit";
import { getPromotion, updatePromotion, updatePromotionIfState } from "@/db/repositories/promotions";
import type { BroadcastInput, BroadcastReceipt } from "@/integrations/woztell/open-api-client";
import { canRetryPromotion, transitionPromotion } from "@/domain/promotions/transitions";
import { interpolatePromotionMessage } from "@/domain/promotions/code";

export type BroadcastProvider = { createBroadcast(input: BroadcastInput): Promise<BroadcastReceipt> };
export type SendPromotionInput = {
  db: DatabaseExecutor;
  promotionId: string;
  provider: BroadcastProvider;
  audienceId: string;
  name?: string;
  /** Deprecated caller input; approved promotion fields are authoritative. */
  messages?: Record<string, unknown>;
  scheduleAt?: number;
  priority?: string | number;
  now?: Date;
  attempts?: number;
  repositories?: Partial<{
    getPromotion: typeof getPromotion;
    updatePromotion: typeof updatePromotion;
    updatePromotionIfState: typeof updatePromotionIfState;
    appendAuditEvent: typeof appendAuditEvent;
  }>;
};
export type SendPromotionResult = { promotion: Record<string, unknown>; receipt?: BroadcastReceipt; state: string; attempts: number };

type PromotionRecord = Record<string, unknown>;

function asDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new Error(`promotion ${field} is invalid`);
  return date;
}

function receiptFromPromotion(promotion: PromotionRecord): BroadcastReceipt | undefined {
  const receipt = promotion.providerReceipt;
  if (receipt && typeof receipt === "object" && !Array.isArray(receipt) && typeof (receipt as Record<string, unknown>).broadcastId === "string") {
    return receipt as BroadcastReceipt;
  }
  if (typeof promotion.providerBroadcastId === "string") {
    return {
      broadcastId: promotion.providerBroadcastId,
      memberCount: typeof promotion.memberCount === "number" ? promotion.memberCount : null,
      sentCount: typeof promotion.sentCount === "number" ? promotion.sentCount : null,
    };
  }
  return undefined;
}

function buildApprovedMessages(promotion: PromotionRecord): Record<string, unknown> {
  const body = String(promotion.body ?? "").trim();
  const campaignCode = String(promotion.campaignCode ?? "").trim();
  const validUntil = asDate(promotion.validUntil, "validUntil");
  if (!body || !campaignCode) throw new Error("approved promotion content is incomplete");
  const expiresAt = validUntil.toISOString();
  const text = interpolatePromotionMessage({ template: body, code: campaignCode, expiresAt });
  return { body: text, campaignCode, expiresAt };
}

export async function sendPromotion(input: SendPromotionInput): Promise<SendPromotionResult> {
  const get = input.repositories?.getPromotion ?? getPromotion;
  const update = input.repositories?.updatePromotion ?? updatePromotion;
  const updateIfState = input.repositories?.updatePromotionIfState;
  const audit = input.repositories?.appendAuditEvent ?? appendAuditEvent;
  const current = await get(input.db, input.promotionId) as PromotionRecord | undefined;
  if (!current) throw new Error(`promotion ${input.promotionId} not found`);
  const state = String(current.state ?? "queued");
  const attempts = input.attempts ?? Number(current.attempts ?? 0);

  if (state === "accepted") {
    const receipt = receiptFromPromotion(current);
    return { promotion: current, receipt, state, attempts };
  }
  if (state === "cancelled") throw new Error(`promotion ${input.promotionId} cannot be retried from ${state}`);
  if (state === "send_failed" && !canRetryPromotion(state, attempts)) {
    await audit(input.db, { actorType: "system", action: "promotion_retry_exhausted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:retry-exhausted`, metadata: { attempts } });
    throw new Error("promotion retry limit reached");
  }
  if (transitionPromotion({ state, event: "send" }).next === "unchanged") throw new Error(`promotion ${input.promotionId} is not sendable from ${state}`);

  const nextAttempts = attempts + 1;
  const claimed = updateIfState
    ? await updateIfState(input.db, input.promotionId, state, { state: "sending", attempts: nextAttempts } as never)
    : await update(input.db, input.promotionId, { state: "sending", attempts: nextAttempts } as never);
  if (!claimed) {
    const latest = await get(input.db, input.promotionId) as PromotionRecord | undefined;
    if (latest?.state === "accepted") return { promotion: latest, receipt: receiptFromPromotion(latest), state: "accepted", attempts: Number(latest.attempts ?? attempts) };
    throw new Error(`promotion ${input.promotionId} send is already in progress`);
  }

  const broadcast: BroadcastInput = {
    promotionId: input.promotionId,
    audienceId: input.audienceId,
    name: input.name ?? `Promotion ${input.promotionId}`,
    messages: buildApprovedMessages(current),
    scheduleAt: input.scheduleAt ?? Math.floor((input.now ?? new Date()).getTime() / 1000),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  };
  try {
    const receipt = await input.provider.createBroadcast(broadcast);
    const acceptedValues = {
      state: "accepted",
      providerBroadcastId: receipt.broadcastId,
      memberCount: receipt.memberCount,
      sentCount: receipt.sentCount,
      providerReceipt: receipt as unknown as Record<string, unknown>,
      acceptedAt: input.now ?? new Date(),
      attempts: nextAttempts,
    };
    const accepted = updateIfState
      ? await updateIfState(input.db, input.promotionId, "sending", acceptedValues as never)
      : await update(input.db, input.promotionId, acceptedValues as never);
    const promotion = (accepted ?? { ...current, ...acceptedValues }) as PromotionRecord;
    await audit(input.db, { actorType: "system", action: "promotion_accepted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:accepted`, metadata: { broadcastId: receipt.broadcastId, memberCount: receipt.memberCount, sentCount: receipt.sentCount, attempts: nextAttempts } });
    return { promotion, receipt, state: "accepted", attempts: nextAttempts };
  } catch {
    const failedValues = { state: "send_failed", attempts: nextAttempts };
    if (updateIfState) await updateIfState(input.db, input.promotionId, "sending", failedValues as never);
    else await update(input.db, input.promotionId, failedValues as never);
    await audit(input.db, { actorType: "system", action: "promotion_send_failed", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:failed:${nextAttempts}`, metadata: { attempts: nextAttempts, retryable: nextAttempts < 3 } });
    if (nextAttempts >= 3) await audit(input.db, { actorType: "system", action: "promotion_retry_exhausted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:retry-exhausted`, metadata: { attempts: nextAttempts } });
    return { promotion: { ...current, state: "send_failed", attempts: nextAttempts }, state: "send_failed", attempts: nextAttempts };
  }
}