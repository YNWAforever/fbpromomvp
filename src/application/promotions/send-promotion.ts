import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent } from "@/db/repositories/audit";
import { getPromotion, updatePromotion } from "@/db/repositories/promotions";
import type { BroadcastInput, BroadcastReceipt } from "@/integrations/woztell/open-api-client";
import { canRetryPromotion, transitionPromotion } from "@/domain/promotions/transitions";
export type BroadcastProvider = { createBroadcast(input: BroadcastInput): Promise<BroadcastReceipt> };
export type SendPromotionInput = { db: DatabaseExecutor; promotionId: string; provider: BroadcastProvider; audienceId: string; name?: string; messages: Record<string, unknown>; scheduleAt?: number; priority?: string | number; now?: Date; attempts?: number; repositories?: Partial<{ getPromotion: typeof getPromotion; updatePromotion: typeof updatePromotion; appendAuditEvent: typeof appendAuditEvent }> };
export type SendPromotionResult = { promotion: Record<string, unknown>; receipt?: BroadcastReceipt; state: string; attempts: number };
export async function sendPromotion(input: SendPromotionInput): Promise<SendPromotionResult> {
  const get = input.repositories?.getPromotion ?? getPromotion; const update = input.repositories?.updatePromotion ?? updatePromotion; const audit = input.repositories?.appendAuditEvent ?? appendAuditEvent;
  const current = await get(input.db, input.promotionId) as Record<string, unknown> | undefined; if (!current) throw new Error(`promotion ${input.promotionId} not found`);
  const state = String(current.state ?? "queued"); if (state === "accepted" || state === "cancelled") throw new Error(`promotion ${input.promotionId} cannot be retried from ${state}`);
  const attempts = input.attempts ?? Number(current.attempts ?? 0);
  if (state === "send_failed" && !canRetryPromotion(state, attempts)) { await audit(input.db, { actorType: "system", action: "promotion_retry_exhausted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:retry-exhausted`, metadata: { attempts } }); throw new Error("promotion retry limit reached"); }
  if (transitionPromotion({ state, event: "send" }).next === "unchanged") throw new Error(`promotion ${input.promotionId} is not sendable from ${state}`);
  const nextAttempts = attempts + 1; await update(input.db, input.promotionId, { state: "sending", attempts: nextAttempts } as never);
  const broadcast: BroadcastInput = { promotionId: input.promotionId, audienceId: input.audienceId, name: input.name ?? `Promotion ${input.promotionId}`, messages: input.messages, scheduleAt: input.scheduleAt ?? Math.floor((input.now ?? new Date()).getTime() / 1000), ...(input.priority === undefined ? {} : { priority: input.priority }) };
  try {
    const receipt = await input.provider.createBroadcast(broadcast); await update(input.db, input.promotionId, { state: "accepted", providerBroadcastId: receipt.broadcastId, memberCount: receipt.memberCount, sentCount: receipt.sentCount, acceptedAt: input.now ?? new Date(), attempts: nextAttempts } as never);
    await audit(input.db, { actorType: "system", action: "promotion_accepted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:accepted`, metadata: { broadcastId: receipt.broadcastId, memberCount: receipt.memberCount, sentCount: receipt.sentCount, attempts: nextAttempts } });
    return { promotion: { ...current, state: "accepted", providerBroadcastId: receipt.broadcastId, memberCount: receipt.memberCount, sentCount: receipt.sentCount, attempts: nextAttempts }, receipt, state: "accepted", attempts: nextAttempts };
  } catch {
    await update(input.db, input.promotionId, { state: "send_failed", attempts: nextAttempts } as never); await audit(input.db, { actorType: "system", action: "promotion_send_failed", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:failed:${nextAttempts}`, metadata: { attempts: nextAttempts, retryable: nextAttempts < 3 } });
    if (nextAttempts >= 3) await audit(input.db, { actorType: "system", action: "promotion_retry_exhausted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:retry-exhausted`, metadata: { attempts: nextAttempts } });
    return { promotion: { ...current, state: "send_failed", attempts: nextAttempts }, state: "send_failed", attempts: nextAttempts };
  }
}
