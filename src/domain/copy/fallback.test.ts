import { describe, expect, it } from "vitest";
import { fallbackCandidates } from "./fallback";
import type { OfferFacts } from "./types";

const facts: OfferFacts = {
  headline: "Harbour Cafe 靜市優惠",
  benefit: "消費滿 HK$100 即減 HK$20",
  conditions: ["每位客人只限使用一次"],
};

describe("deterministic copy fallback", () => {
  it("returns three distinct grounded candidates with expiry and opt-out text", () => {
    const candidates = fallbackCandidates({ venueName: "Harbour Cafe", facts, expiresAt: "17:00" });
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.body)).size).toBe(3);
    for (const candidate of candidates) {
      expect(candidate.source).toBe("fallback");
      expect(candidate.valid).toBe(true);
      expect(candidate.body).toContain(facts.benefit);
      expect(candidate.body).toContain("17:00");
      expect(candidate.body).toContain("停止");
    }
  });
});
