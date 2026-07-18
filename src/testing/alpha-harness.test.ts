import { describe, expect, it } from "vitest";
import { createAlphaHarness } from "./alpha-harness";

describe("alpha lifecycle test harness", () => {
  it("deduplicates signed hourly jobs and approval callbacks", async () => {
    const alpha = createAlphaHarness();
    await alpha.onboard({ name: "Harbour Cafe", address: "18 Pier Road, Central" });
    await alpha.confirmMatch();
    await alpha.runHourly("hourly-1");
    await alpha.runHourly("hourly-1");
    expect(alpha.snapshot()).toMatchObject({ stage: "active", hourlyRuns: 1, approvalsSent: 0 });
    await alpha.runHourly("hourly-2");
    await alpha.runHourly("hourly-2");
    expect(alpha.snapshot()).toMatchObject({ stage: "approval_pending", hourlyRuns: 2, approvalsSent: 1 });
    await alpha.approve("approval-1");
    await alpha.approve("approval-1");
    expect(alpha.snapshot()).toMatchObject({ stage: "broadcast_accepted", broadcastsAccepted: 1 });
    await alpha.reportRedemptions(8);
    await alpha.runWeekly("weekly-1");
    await alpha.runWeekly("weekly-1");
    expect(alpha.snapshot()).toMatchObject({ stage: "weekly_sent", redemptions: 8, weeklyReportsSent: 1, reportSummary: "8 redemptions" });
  });
});
