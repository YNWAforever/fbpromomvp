import type { CopyValidationResult, OfferFacts } from "./types";

const MAX_BODY_CODE_POINTS = 500;

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

/** Validate model or owner-edited copy against the approved offer facts. */
export function validateCopyCandidate(body: string, facts: OfferFacts): CopyValidationResult {
  const errors: string[] = [];
  const value = typeof body === "string" ? body.trim() : "";
  if (!value) errors.push("body_required");
  if (Array.from(value).length > MAX_BODY_CODE_POINTS) errors.push("body_too_long");

  const normalizedBody = normalized(value);
  if (!normalizedBody || !normalizedBody.includes(normalized(facts.benefit))) errors.push("benefit_not_grounded");

  const approvedClaims = new Set(claimTokens([facts.headline, facts.benefit, ...facts.conditions].join(" ")));
  const unapprovedClaim = claimTokens(value).some((claim) => !approvedClaims.has(claim));
  if (unapprovedClaim) errors.push("unapproved_claim");

  return { valid: errors.length === 0, validationErrors: errors };
}

export const validateCopy = validateCopyCandidate;
