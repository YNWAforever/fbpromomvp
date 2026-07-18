import { createHash } from "node:crypto";

/** Stable, opaque campaign code. The promotion id is the idempotency subject. */
export function createCampaignCode(promotionId: string, secret = "off-peak-rescue"): string {
  if (!promotionId.trim()) throw new Error("promotion id is required");
  const digest = createHash("sha256").update(`${secret}:${promotionId}`).digest("hex").slice(0, 12).toUpperCase();
  return `OPR-${digest}`;
}

export const generateCampaignCode = createCampaignCode;

export function interpolatePromotionMessage(input: { template: string; code: string; expiresAt: Date | string }): string {
  const expiry = input.expiresAt instanceof Date ? input.expiresAt.toISOString() : input.expiresAt;
  return input.template.replace(/\{\{\s*code\s*\}\}/giu, input.code).replace(/\{\{\s*expiresAt\s*\}\}/giu, expiry);
}
