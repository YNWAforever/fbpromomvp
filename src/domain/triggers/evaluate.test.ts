import { describe, expect, it } from "vitest";
import { evaluateTrigger } from "./evaluate";

const base = {
  active: true,
  insideBusinessHours: true,
  currentDelta: -25,
  previousDelta: -18,
  hasPendingPromotion: false,
  acceptedToday: 0,
  acceptedThisWeek: 0,
  dailyLimit: 1,
  weeklyLimit: 3,
};

describe("evaluateTrigger", () => {
  it("offers a candidate for sustained quiet", () => {
    expect(evaluateTrigger(base)).toEqual({ decision: "candidate", reason: "sustained_quiet" });
  });

  it("checks policy in order", () => {
    expect(evaluateTrigger({ ...base, active: false }).reason).toBe("inactive");
    expect(evaluateTrigger({ ...base, insideBusinessHours: false }).reason).toBe("outside_business_hours");
    expect(evaluateTrigger({ ...base, currentDelta: null }).reason).toBe("missing_data");
    expect(evaluateTrigger({ ...base, currentDelta: -10 }).reason).toBe("threshold");
    expect(evaluateTrigger({ ...base, previousDelta: -10 }).reason).toBe("debounce");
    expect(evaluateTrigger({ ...base, hasPendingPromotion: true }).reason).toBe("pending_promotion");
    expect(evaluateTrigger({ ...base, acceptedToday: 1 }).reason).toBe("daily_limit");
    expect(evaluateTrigger({ ...base, acceptedThisWeek: 3 }).reason).toBe("weekly_limit");
  });

  it("rejects stale readings and supports explicit manual review", () => {
    const now = new Date("2026-07-14T04:00:00Z");
    expect(
      evaluateTrigger({
        ...base,
        now,
        currentReading: { observedAt: new Date("2026-07-14T03:00:00Z"), status: "ok", delta: -25 },
      }).reason,
    ).toBe("stale_data");
    expect(evaluateTrigger({ ...base, manualReview: true })).toEqual({ decision: "manual_review", reason: "manual_review" });
  });

  it("rejects a preceding reading that is stale, unavailable, or outside the preceding window", () => {
    const now = new Date("2026-07-14T04:00:00Z");
    const currentReading = { observedAt: now, status: "ok" as const, delta: -25 };
    const previousReading = { observedAt: new Date("2026-07-14T03:00:00Z"), status: "ok" as const, delta: -18 };
    expect(evaluateTrigger({ ...base, now, currentReading, previousReading, previousMaxAgeMs: 90 * 60 * 1000 }).decision).toBe("candidate");
    expect(evaluateTrigger({ ...base, now, currentReading, previousReading: { ...previousReading, observedAt: new Date("2026-07-12T03:00:00Z") }, previousMaxAgeMs: 90 * 60 * 1000 }).reason).toBe("stale_data");
    expect(evaluateTrigger({ ...base, now, currentReading, previousReading: { ...previousReading, status: "unavailable" }, previousMaxAgeMs: 90 * 60 * 1000 }).reason).toBe("stale_data");
    expect(evaluateTrigger({ ...base, now, currentReading, previousReading, previousFresh: false, previousMaxAgeMs: 90 * 60 * 1000 }).reason).toBe("stale_data");
  });
});

