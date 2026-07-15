import type { CopyValidationResult, OfferFacts } from "./types";

const MAX_BODY_CODE_POINTS = 500;
export const OPT_OUT_TEXT = "如不想收到優惠，請回覆「停止」";

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function claimTokens(value: string): string[] {
  const tokens = new Set<string>();
  // Keep the complete token so HK$100 and HK$100.00 cannot be confused.
  for (const match of value.matchAll(/(?:HK\$|\$|￥|¥)\s*\d+(?:[,.]\d+)?|\b\d+(?:[,.]\d+)?\s*%/giu)) {
    tokens.add(match[0].replace(/\s+/gu, "").toLowerCase());
  }
  return [...tokens];
}

export type CopyValidationOptions = { expiresAt?: string };

/** Validate model or owner-edited copy against the approved offer facts. */
export function validateCopyCandidate(body: string, facts: OfferFacts, options: CopyValidationOptions = {}): CopyValidationResult {
  const errors: string[] = [];
  const value = typeof body === "string" ? body.trim() : "";
  if (!value) errors.push("body_required");
  if (Array.from(value).length > MAX_BODY_CODE_POINTS) errors.push("body_too_long");

  const normalizedBody = normalized(value);
  if (!normalizedBody || !normalizedBody.includes(normalized(facts.benefit))) errors.push("benefit_not_grounded");

  const approvedClaims = new Set(claimTokens([facts.headline, facts.benefit, ...facts.conditions].join(" ")));
  const unapprovedClaim = claimTokens(value).some((claim) => !approvedClaims.has(claim));
  if (unapprovedClaim) errors.push("unapproved_claim");

  if (options.expiresAt) {
    const expiryText = `優惠有效至 ${options.expiresAt}`;
    if (!normalizedBody.includes(normalized(expiryText))) errors.push("expiry_required");
    if (!normalizedBody.includes(normalized(OPT_OUT_TEXT))) errors.push("opt_out_required");
  }

  return { valid: errors.length === 0, validationErrors: errors };
}

/** Add the mandatory expiry and opt-out clauses before validating model output. */
export function normalizeCopyBody(body: string, expiresAt: string): string {
  let value = typeof body === "string" ? body.trim() : "";
  const expiryText = `優惠有效至 ${expiresAt}`;
  // Replace an existing generated expiry clause so stale approval-window values cannot survive.
  value = value.replace(/優惠有效至[^。！？!?]*(?:[。！？!?]|$)/gu, "").trim();
  const suffix = [expiryText, OPT_OUT_TEXT].filter((term) => !normalized(value).includes(normalized(term))).join("。 ");
  if (suffix) value = `${value}${value ? "。" : ""}${suffix}。`;
  return value;
}

export const validateCopy = validateCopyCandidate;
