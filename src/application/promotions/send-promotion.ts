import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent, findAuditEventByIdempotencyKey } from "@/db/repositories/audit";
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
    findAuditEventByIdempotencyKey: typeof findAuditEventByIdempotencyKey;
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
  // Production always uses the conditional update; the unconditioned helper
  // remains available only as an explicit unit-test seam.
  const updateIfState = input.repositories?.updatePromotionIfState ?? updatePromotionIfState;
  const updateUnconditionally = input.repositories?.updatePromotion;
  const audit = input.repositories?.appendAuditEvent ?? appendAuditEvent;
  const findAudit = input.repositories?.findAuditEventByIdempotencyKey ?? findAuditEventByIdempotencyKey;
  const current = await get(input.db, input.promotionId) as PromotionRecord | undefined;
  if (!current) throw new Error(`promotion ${input.promotionId} not found`);
  const state = String(current.state ?? "queued");
  const attempts = input.attempts ?? Number(current.attempts ?? 0);

  const updateState = async (expectedState: string, values: Record<string, unknown>) => {
    if (input.repositories?.updatePromotionIfState) {
      return input.repositories.updatePromotionIfState(input.db, input.promotionId, expectedState, values as never);
    }
    if (updateUnconditionally) {
      return updateUnconditionally(input.db, input.promotionId, values as never);
    }
    return updateIfState(input.db, input.promotionId, expectedState, values as never);
  };

  const persistenceError = (cause: unknown) => {
    const error = new Error("WozTell promotion accepted but local persistence failed");
    (error as Error & { code?: string; cause?: unknown }).code = "send_persistence_failed";
    (error as Error & { code?: string; cause?: unknown }).cause = cause;
    return error;
  };

  const reconcileAccepted = async (expectedState: string, receipt: BroadcastReceipt, acceptedAt: Date, acceptedAttempts: number) => {
    const acceptedValues = {
      state: "accepted",
      providerBroadcastId: receipt.broadcastId,
      memberCount: receipt.memberCount,
      sentCount: receipt.sentCount,
      providerReceipt: receipt as unknown as Record<string, unknown>,
      acceptedAt,
      attempts: acceptedAttempts,
    };
    try {
      const accepted = await updateState(expectedState, acceptedValues);
      if (!accepted) {
        const latest = await get(input.db, input.promotionId) as PromotionRecord | undefined;
        if (latest?.state === "accepted") return { promotion: latest, receipt: receiptFromPromotion(latest) ?? receipt, state: "accepted", attempts: Number(latest.attempts ?? acceptedAttempts) };
        throw new Error(`promotion ${input.promotionId} acceptance was not persisted`);
      }
      await audit(input.db, {
        actorType: "system",
        action: "promotion_accepted",
        objectType: "promotion",
        objectId: input.promotionId,
        idempotencyKey: `promotion:${input.promotionId}:accepted`,
        metadata: { broadcastId: receipt.broadcastId, memberCount: receipt.memberCount, sentCount: receipt.sentCount, attempts: acceptedAttempts, providerReceipt: receipt },
      });
      return { promotion: accepted as PromotionRecord, receipt, state: "accepted", attempts: acceptedAttempts };
    } catch (cause) {
      try {
        await audit(input.db, {
          actorType: "system",
          action: "promotion_send_persistence_failed",
          objectType: "promotion",
          objectId: input.promotionId,
          idempotencyKey: `promotion:${input.promotionId}:accepted-persistence-pending`,
          metadata: { state: "provider_accepted_local_persistence_pending", broadcastId: receipt.broadcastId, memberCount: receipt.memberCount, sentCount: receipt.sentCount, providerReceipt: receipt, attempts: acceptedAttempts },
        });
      } catch {
        // Never turn provider acceptance into a retryable provider failure.
      }
      throw persistenceError(cause);
    }
  };

  if (state === "accepted") {
    const receipt = receiptFromPromotion(current);
    return { promotion: current, receipt, state, attempts };
  }
  if (state === "sending") {
    const acceptedMarker = await findAudit(input.db, `promotion:${input.promotionId}:accepted-persistence-pending`);
    const acceptedReceipt = receiptFromAcceptedAudit(acceptedMarker);
    if (acceptedReceipt) return reconcileAccepted(state, acceptedReceipt, input.now ?? new Date(), attempts);
  }
  if (state === "cancelled") throw new Error(`promotion ${input.promotionId} cannot be retried from ${state}`);
  if (state === "send_failed" && !canRetryPromotion(state, attempts)) {
    await audit(input.db, { actorType: "system", action: "promotion_retry_exhausted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:retry-exhausted`, metadata: { attempts } });
    throw new Error("promotion retry limit reached");
  }
  if (transitionPromotion({ state, event: "send" }).next === "unchanged") throw new Error(`promotion ${input.promotionId} is not sendable from ${state}`);

  const nextAttempts = attempts + 1;
  const claimed = await updateState(state, { state: "sending", attempts: nextAttempts });
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
  let receipt: BroadcastReceipt;
  try {
    receipt = await input.provider.createBroadcast(broadcast);
  } catch {
    const failedValues = { state: "send_failed", attempts: nextAttempts };
    await updateState("sending", failedValues);
    await audit(input.db, { actorType: "system", action: "promotion_send_failed", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:failed:${nextAttempts}`, metadata: { attempts: nextAttempts, retryable: nextAttempts < 3 } });
    if (nextAttempts >= 3) await audit(input.db, { actorType: "system", action: "promotion_retry_exhausted", objectType: "promotion", objectId: input.promotionId, idempotencyKey: `promotion:${input.promotionId}:retry-exhausted`, metadata: { attempts: nextAttempts } });
    return { promotion: { ...current, state: "send_failed", attempts: nextAttempts }, state: "send_failed", attempts: nextAttempts };
  }

  return reconcileAccepted("sending", receipt, input.now ?? new Date(), nextAttempts);
}
function receiptFromAcceptedAudit(event: unknown): BroadcastReceipt | undefined {
  if (!event || typeof event !== "object" || Array.isArray(event)) return undefined;
  const metadata = (event as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const values = metadata as Record<string, unknown>;
  const receipt = values.providerReceipt;
  if (receipt && typeof receipt === "object" && !Array.isArray(receipt) && typeof (receipt as Record<string, unknown>).broadcastId === "string") {
    return receipt as BroadcastReceipt;
  }
  if (typeof values.broadcastId !== "string") return undefined;
  return {
    broadcastId: values.broadcastId,
    memberCount: typeof values.memberCount === "number" ? values.memberCount : null,
    sentCount: typeof values.sentCount === "number" ? values.sentCount : null,
  };
}
