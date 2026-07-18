import { describe, expect, it } from "vitest";
import { aggregateWeeklyReport } from "./aggregate";

describe("aggregateWeeklyReport", () => {
  it("keeps unknown delivery metrics unavailable", () => {
    expect(aggregateWeeklyReport({ readings: [], triggers: [], approvals: [], promotions: [{ state: "accepted", sentCount: null }], redemptions: [] }).sentCount).toBeNull();
  });

  it("aggregates weekly funnel metrics and orders chart points", () => {
    const result = aggregateWeeklyReport({
      readings: [
        { observedAt: "2026-07-06T08:00:00Z", delta: -15 },
        { observedAt: "2026-07-06T07:00:00Z", delta: -25 },
      ],
      triggers: [{ decision: "candidate", delta: -25 }, { decision: "not_quiet", delta: -15 }],
      approvals: [{ state: "approved" }, { state: "skipped" }, { state: "expired" }],
      promotions: [{ state: "accepted", sentCount: 100 }],
      redemptions: [{ count: 8 }],
      averageOrderValue: 80,
    });
    expect(result).toMatchObject({ checks: 2, triggers: 1, approvals: 1, skips: 1, timeouts: 1, acceptedBroadcasts: 1, sentCount: 100, redeemedCount: 8, redemptionRate: 0.08, revenue: 640, averageTriggerDelta: -25 });
    expect(result.chartPoints).toEqual([
      { at: "2026-07-06T07:00:00Z", delta: -25 },
      { at: "2026-07-06T08:00:00Z", delta: -15 },
    ]);
  });

  it("returns the exact sample chart point shape", () => {
    const sample = {
      readings: [{ observedAt: "2026-07-06T07:00:00Z", delta: -25 }],
      triggers: [{ decision: "candidate" }],
      promotions: [{ sentCount: 100 }],
      redemptions: [{ count: 8 }],
    };
    expect(aggregateWeeklyReport(sample).chartPoints).toEqual([{ at: "2026-07-06T07:00:00Z", delta: -25 }]);
  });

  it("averages only deltas attached to candidate triggers", () => {
    const result = aggregateWeeklyReport({
      readings: [
        { observedAt: "2026-07-06T07:00:00Z", delta: -25 },
        { observedAt: "2026-07-06T08:00:00Z", delta: 20 },
      ],
      triggers: [
        { decision: "candidate", delta: -25 },
        { decision: "not_quiet", delta: 20 },
      ],
      promotions: [],
      redemptions: [],
    });

    expect(result.averageTriggerDelta).toBe(-25);
  });
});