import { describe, expect, it } from "vitest";
import { validateCopyCandidate } from "./validate";
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
});
