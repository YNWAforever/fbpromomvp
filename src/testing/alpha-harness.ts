import { createFakeBestTimeProvider, createFakeOpenCodeGoProvider, createFakeWozTellProvider } from "@/integrations/fakes";

type AlphaStage = "new" | "match_ready" | "active" | "approval_pending" | "broadcast_accepted" | "weekly_sent";
type AlphaSnapshot = {
  stage: AlphaStage; venueName: string | null; providerVenueId: string | null; hourlyRuns: number; approvalsSent: number; broadcastsAccepted: number; redemptions: number; weeklyReportsSent: number; reportSummary: string | null;
};

const facts = { headline: "Afternoon offer", benefit: "HK$20 off selected drinks", conditions: ["Dine-in only"] };
const expiry = "2026-07-14T12:00:00.000Z";

/** Credential-free in-memory lifecycle used only by test-routed helpers. */
export function createAlphaHarness() {
  const bestTime = createFakeBestTimeProvider();
  const copy = createFakeOpenCodeGoProvider();
  const woztell = createFakeWozTellProvider();
  const seenHourlyKeys = new Set<string>();
  const seenApprovalKeys = new Set<string>();
  const seenWeeklyKeys = new Set<string>();
  let state: AlphaSnapshot = { stage: "new", venueName: null, providerVenueId: null, hourlyRuns: 0, approvalsSent: 0, broadcastsAccepted: 0, redemptions: 0, weeklyReportsSent: 0, reportSummary: null };
  const requireStage = (allowed: AlphaStage[]) => { if (!allowed.includes(state.stage)) throw new Error(`alpha lifecycle cannot continue from ${state.stage}`); };
  const requireKey = (key: string) => { if (!key.trim()) throw new Error("idempotency key is required"); };

  return {
    async onboard(input: { name: string; address: string }) {
      requireStage(["new"]); const coverage = await bestTime.checkCoverage(input);
      if (!coverage.available || !coverage.providerVenueId) throw new Error("fake coverage is unavailable");
      state = { ...state, stage: "match_ready", venueName: input.name, providerVenueId: coverage.providerVenueId }; return this.snapshot();
    },
    async confirmMatch() { requireStage(["match_ready"]); state = { ...state, stage: "active" }; return this.snapshot(); },
    async runHourly(idempotencyKey: string) {
      requireKey(idempotencyKey); if (seenHourlyKeys.has(idempotencyKey)) return this.snapshot();
      requireStage(["active", "approval_pending"]); if (!state.providerVenueId) throw new Error("provider venue is required");
      seenHourlyKeys.add(idempotencyKey); await bestTime.getLive(state.providerVenueId); const hourlyRuns = state.hourlyRuns + 1; state = { ...state, hourlyRuns };
      if (hourlyRuns < 2 || state.stage === "approval_pending") return this.snapshot();
      const candidates = await copy.generate({ venueName: state.venueName ?? "Venue", facts, expiresAt: expiry, tone: "warm" });
      await woztell.sendApproval({ approvalId: "fake-approval-1", memberId: "fake-owner-1", expiresAt: expiry, candidates: candidates.map((candidate, index) => ({ id: `fake-candidate-${index + 1}`, body: candidate.body })) });
      state = { ...state, stage: "approval_pending", approvalsSent: woztell.approvals.length }; return this.snapshot();
    },
    async approve(idempotencyKey: string) {
      requireKey(idempotencyKey); if (seenApprovalKeys.has(idempotencyKey)) return this.snapshot();
      requireStage(["approval_pending"]); seenApprovalKeys.add(idempotencyKey);
      await woztell.createBroadcast({ promotionId: "fake-promotion-1", audienceId: "test-priority-group", name: `${state.venueName ?? "Venue"} offer`, messages: { body: woztell.approvals[0]?.candidates[0]?.body ?? "" }, scheduleAt: 1_784_318_400 });
      state = { ...state, stage: "broadcast_accepted", broadcastsAccepted: woztell.broadcasts.length }; return this.snapshot();
    },
    async reportRedemptions(count: number) { requireStage(["broadcast_accepted"]); if (!Number.isInteger(count) || count < 0) throw new Error("redemptions must be a non-negative integer"); state = { ...state, redemptions: count }; return this.snapshot(); },
    async runWeekly(idempotencyKey: string) {
      requireKey(idempotencyKey); if (seenWeeklyKeys.has(idempotencyKey)) return this.snapshot();
      requireStage(["broadcast_accepted"]); seenWeeklyKeys.add(idempotencyKey);
      await woztell.sendReport({ reportId: "fake-weekly-report-1", venueId: "fake-venue-1", venueName: state.venueName ?? "Venue", memberId: "fake-owner-1", periodStart: "2026-07-06T00:00:00.000Z", periodEnd: "2026-07-13T00:00:00.000Z", reportUrl: "http://example.test/reports/fake", imageUrl: "http://example.test/reports/fake/image" });
      state = { ...state, stage: "weekly_sent", weeklyReportsSent: woztell.reports.length, reportSummary: `${state.redemptions} redemptions` }; return this.snapshot();
    },
    snapshot() { return { ...state }; },
  };
}

let activeAlphaHarness = createAlphaHarness();
export function getAlphaHarness() { return activeAlphaHarness; }
export function resetAlphaHarness() { activeAlphaHarness = createAlphaHarness(); return activeAlphaHarness.snapshot(); }
