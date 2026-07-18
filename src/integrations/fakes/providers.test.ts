import { describe, expect, it } from "vitest";
import { createFakeBestTimeProvider, createFakeOpenCodeGoProvider, createFakeWozTellProvider } from "./index";

describe("deterministic alpha providers", () => {
  it("returns a confirmed coverage match and two qualifying quiet-period readings", async () => {
    const provider = createFakeBestTimeProvider();

    await expect(provider.checkCoverage({ name: "Harbour Cafe", address: "18 Pier Road, Central" }))
      .resolves.toMatchObject({ available: true, providerVenueId: "fake-besttime-harbour-cafe" });

    await expect(provider.getLive("fake-besttime-harbour-cafe")).resolves.toMatchObject({ delta: -18, status: "ok" });
    await expect(provider.getLive("fake-besttime-harbour-cafe")).resolves.toMatchObject({ delta: -25, status: "ok" });
  });

  it("returns three valid, fact-grounded copy candidates", async () => {
    const provider = createFakeOpenCodeGoProvider();
    const facts = { headline: "下午茶時段優惠", benefit: "指定飲品減 HK$20", conditions: ["只限堂食"] };

    const candidates = await provider.generate({
      venueName: "Harbour Cafe",
      facts,
      expiresAt: "2026-07-14T12:00:00.000Z",
      tone: "warm",
    });

    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.source === "model" && candidate.valid)).toBe(true);
    expect(candidates.every((candidate) => candidate.body.includes(facts.benefit))).toBe(true);
  });

  it("records approval, broadcast, and weekly-report requests without a network call", async () => {
    const provider = createFakeWozTellProvider();

    await expect(provider.sendApproval({
      approvalId: "approval-1",
      memberId: "member-1",
      expiresAt: "2026-07-14T12:00:00.000Z",
      candidates: [
        { id: "candidate-1", body: "one" },
        { id: "candidate-2", body: "two" },
        { id: "candidate-3", body: "three" },
      ],
    })).resolves.toEqual({ messageId: "fake-approval-1" });

    await expect(provider.createBroadcast({
      promotionId: "promotion-1",
      audienceId: "test-priority-group",
      name: "Harbour Cafe offer",
      messages: { body: "offer" },
      scheduleAt: 1_784_318_400,
    })).resolves.toMatchObject({ broadcastId: "fake-broadcast-1", sentCount: 1 });

    await expect(provider.sendReport({
      reportId: "report-1",
      venueId: "venue-1",
      venueName: "Harbour Cafe",
      memberId: "member-1",
      periodStart: "2026-07-06T00:00:00.000Z",
      periodEnd: "2026-07-13T00:00:00.000Z",
      reportUrl: "http://example.test/reports/token",
      imageUrl: "http://example.test/reports/token/image",
    })).resolves.toEqual({ messageId: "fake-weekly-report-1" });

    expect(provider.approvals).toHaveLength(1);
    expect(provider.broadcasts).toHaveLength(1);
    expect(provider.reports).toHaveLength(1);
  });
});
