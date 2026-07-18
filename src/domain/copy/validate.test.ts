import { describe, expect, it } from "vitest";
import { normalizeCopyBody, OPT_OUT_TEXT, validateCopyCandidate } from "./validate";
import type { OfferFacts } from "./types";

const approvedFacts: OfferFacts = {
  headline: "今日靜市優惠 HK$20",
  benefit: "消費滿 HK$100 即減 HK$20",
  conditions: ["只限今日 17:00 前使用"],
};

describe("grounded promotion copy", () => {
  it("accepts copy that includes the approved benefit and rejects invented claims", () => {
    expect(validateCopyCandidate("今日靜市優惠：消費滿 HK$100 即減 HK$20。只限今日 17:00 前使用。", approvedFacts)).toEqual({
      valid: true,
      validationErrors: [],
    });
    expect(validateCopyCandidate("今日消費滿 HK$200 即減 HK$100，保證半價！", approvedFacts).valid).toBe(false);
  });

  it("rejects missing approved benefit, unsupported money/percentage, and long bodies", () => {
    expect(validateCopyCandidate("今日有優惠，快來看看！", approvedFacts).validationErrors).toContain("benefit_not_grounded");
    expect(validateCopyCandidate("消費滿 HK$100 即減 HK$20，節省 50%！", approvedFacts).validationErrors).toContain("unapproved_claim");
    expect(validateCopyCandidate(`${approvedFacts.benefit}${"好".repeat(500)}`, approvedFacts).validationErrors).toContain("body_too_long");
  });

  it("requires the application-injected two-hour expiry and opt-out wording", () => {
    const expiresAt = "2026-07-14T12:00:00.000Z";
    expect(validateCopyCandidate(approvedFacts.benefit, approvedFacts, { expiresAt }).validationErrors).toEqual([
      "expiry_required",
      "opt_out_required",
    ]);
    const normalized = normalizeCopyBody(approvedFacts.benefit, expiresAt);
    expect(normalized).toContain(`\u512a\u60e0\u6709\u6548\u81f3 ${expiresAt}`);
    expect(normalized).toContain(OPT_OUT_TEXT);
    expect(validateCopyCandidate(normalized, approvedFacts, { expiresAt })).toEqual({ valid: true, validationErrors: [] });
  });

  it("replaces a stale generated expiry instead of retaining the approval deadline", () => {
    const stale = `${approvedFacts.benefit}.\u512a\u60e0\u6709\u6548\u81f3 2026-07-14T10:15:00.000Z.`;
    const body = normalizeCopyBody(stale, "2026-07-14T12:00:00.000Z");
    expect(body).not.toContain("10:15:00");
    expect(body).toContain("12:00:00");
  });
});
