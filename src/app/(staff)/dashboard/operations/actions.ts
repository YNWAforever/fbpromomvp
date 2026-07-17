"use server";

import { sendPromotion } from "@/application/promotions/send-promotion";
import { withDatabase } from "@/db/client";
import { appendAuditEvent } from "@/db/repositories/audit";
import { getPromotion, updatePromotionIfState } from "@/db/repositories/promotions";
import { listVenueIntegrations } from "@/db/repositories/venues";
import { createWozTellOpenApiClient } from "@/integrations/woztell/open-api-client";
import { requireStaff } from "@/lib/auth/require-staff";

export type OperationsActionResult =
  | { ok: true; action: "retried" | "cancelled" | "paused"; promotionId: string; state: string; attempts?: number }
  | { ok: false; code: "invalid_input" | "not_found" | "invalid_state" | "missing_audience" | "conflict"; error: string };

function promotionIdFrom(formData: FormData): string {
  const value = formData.get("promotionId");
  return typeof value === "string" ? value.trim() : "";
}

function audienceReference(integrations: Array<{ provider: string; externalId?: string | null; metadata?: unknown }>): string | undefined {
  const integration = integrations.find((candidate) => candidate.provider === "woztell");
  if (!integration) return undefined;
  const metadata = integration.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).audienceReference;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return typeof integration.externalId === "string" && integration.externalId.trim() ? integration.externalId.trim() : undefined;
}

async function loadPromotion(db: Parameters<typeof getPromotion>[0], promotionId: string) {
  if (!promotionId) return undefined;
  return getPromotion(db, promotionId);
}

export async function retryPromotionAction(formData: FormData): Promise<OperationsActionResult> {
  await requireStaff();
  const promotionId = promotionIdFrom(formData);
  if (!promotionId) return { ok: false, code: "invalid_input", error: "Promotion is required." };

  return withDatabase(async (db) => {
    const promotion = await loadPromotion(db, promotionId);
    if (!promotion) return { ok: false, code: "not_found", error: "Promotion unavailable." };
    if (promotion.state !== "send_failed") {
      return { ok: false, code: "invalid_state", error: "Only send failed promotions can be retried." };
    }

    const integrations = await listVenueIntegrations(db, promotion.venueId);
    const audienceId = audienceReference(integrations);
    if (!audienceId) return { ok: false, code: "missing_audience", error: "WozTell audience is not configured." };

    const result = await sendPromotion({
      db,
      promotionId,
      audienceId,
      provider: createWozTellOpenApiClient(),
    });
    return { ok: true, action: "retried", promotionId, state: result.state, attempts: result.attempts };
  });
}

export async function cancelPromotionAction(formData: FormData): Promise<OperationsActionResult> {
  const staff = await requireStaff();
  const promotionId = promotionIdFrom(formData);
  if (!promotionId) return { ok: false, code: "invalid_input", error: "Promotion is required." };

  return withDatabase((db) => db.transaction(async (tx) => {
    const promotion = await loadPromotion(tx, promotionId);
    if (!promotion) return { ok: false, code: "not_found", error: "Promotion unavailable." };
    if (promotion.state !== "queued" && promotion.state !== "send_failed") {
      return { ok: false, code: "invalid_state", error: "Only queued or send failed promotions can be cancelled." };
    }

    const updated = await updatePromotionIfState(tx, promotionId, promotion.state, { state: "cancelled" });
    if (!updated) return { ok: false, code: "conflict", error: "Promotion changed before it could be cancelled; refresh and retry." };
    await appendAuditEvent(tx, {
      actorType: "staff",
      actorId: staff.id,
      action: "promotion_cancelled",
      objectType: "promotion",
      objectId: promotionId,
      idempotencyKey: `staff:${staff.id}:promotion:${promotionId}:cancelled`,
      metadata: { previousState: promotion.state },
    });
    return { ok: true, action: "cancelled", promotionId, state: "cancelled" };
  }));
}

export async function pausePromotionAction(formData: FormData): Promise<OperationsActionResult> {
  const staff = await requireStaff();
  const promotionId = promotionIdFrom(formData);
  if (!promotionId) return { ok: false, code: "invalid_input", error: "Promotion is required." };

  return withDatabase(async (db) => {
    const promotion = await loadPromotion(db, promotionId);
    if (!promotion) return { ok: false, code: "not_found", error: "Promotion unavailable." };
    await appendAuditEvent(db, {
      actorType: "staff",
      actorId: staff.id,
      action: "promotion_paused",
      objectType: "promotion",
      objectId: promotionId,
      idempotencyKey: `staff:${staff.id}:promotion:${promotionId}:paused`,
      metadata: { state: promotion.state },
    });
    return { ok: true, action: "paused", promotionId, state: promotion.state };
  });
}
export async function retryPromotionFormAction(formData: FormData): Promise<void> {
  await retryPromotionAction(formData);
}

export async function cancelPromotionFormAction(formData: FormData): Promise<void> {
  await cancelPromotionAction(formData);
}