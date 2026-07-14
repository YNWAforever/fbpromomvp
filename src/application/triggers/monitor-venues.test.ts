import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  appendAuditEvent: vi.fn(),
  claimJobRun: vi.fn(),
  createLiveReading: vi.fn(),
  createTrigger: vi.fn(),
  createTriggerWithStatus: vi.fn(),
  findJobRunByIdempotencyKey: vi.fn(),
  findTriggerByIdempotencyKey: vi.fn(),
  listActiveVenues: vi.fn(),
  listLiveReadings: vi.fn(),
  listVenueIntegrations: vi.fn(),
  updateJobRun: vi.fn(),
}));

vi.mock("@/db/repositories/audit", () => ({ appendAuditEvent: repositories.appendAuditEvent }));
vi.mock("@/db/repositories/jobs", () => ({
  claimJobRun: repositories.claimJobRun,
  findJobRunByIdempotencyKey: repositories.findJobRunByIdempotencyKey,
  updateJobRun: repositories.updateJobRun,
}));
vi.mock("@/db/repositories/triggers", () => ({
  createLiveReading: repositories.createLiveReading,
  createTrigger: repositories.createTrigger,
  createTriggerWithStatus: repositories.createTriggerWithStatus,
  findTriggerByIdempotencyKey: repositories.findTriggerByIdempotencyKey,
  listLiveReadings: repositories.listLiveReadings,
}));
vi.mock("@/db/repositories/venues", () => ({
  listActiveVenues: repositories.listActiveVenues,
  listVenueIntegrations: repositories.listVenueIntegrations,
}));

import { monitorVenues } from "./monitor-venues";

const now = new Date("2026-07-14T04:00:00Z");
const venue = {
  id: "venue-1",
  timezone: "UTC",
  businessHours: { 2: [{ start: "00:00", end: "23:59" }] },
  dailyLimit: 1,
  weeklyLimit: 3,
  triggerDelta: -20,
  previousDelta: -15,
};

function setup(previous = [{ id: "reading-previous", observedAt: new Date("2026-07-14T03:00:00Z"), status: "ok", delta: -18 }]) {
  repositories.findJobRunByIdempotencyKey.mockResolvedValue(undefined);
  repositories.claimJobRun.mockResolvedValue({ run: { id: "job-1", state: "running" }, claimed: true });
  repositories.listActiveVenues.mockResolvedValue([venue]);
  repositories.listVenueIntegrations.mockResolvedValue([{ provider: "besttime", externalId: "best-1" }]);
  repositories.listLiveReadings.mockResolvedValue(previous);
  repositories.createLiveReading.mockResolvedValue({ id: "reading-current" });
  repositories.findTriggerByIdempotencyKey.mockResolvedValue(undefined);
  repositories.createTrigger.mockResolvedValue({ id: "trigger-1", decision: "candidate" });
  repositories.createTriggerWithStatus.mockResolvedValue({ trigger: { id: "trigger-1", decision: "candidate" }, created: true });
  repositories.appendAuditEvent.mockResolvedValue({ id: "audit-1" });
  repositories.updateJobRun.mockResolvedValue({ id: "job-1" });
}

describe("monitorVenues reliability boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("passes real caps and pending state into policy and dispatches a candidate", async () => {
    const candidateDispatcher = vi.fn().mockResolvedValue(undefined);
    const getAcceptedCounts = vi.fn().mockResolvedValue({ today: 0, week: 0 });
    const hasPendingPromotion = vi.fn().mockResolvedValue(false);
    const result = await monitorVenues({
      db: {} as never,
      provider: { getLive: vi.fn().mockResolvedValue({ observedAt: now, forecastedBusyness: 60, liveBusyness: 35, delta: -25, status: "ok" }), checkCoverage: vi.fn() },
      idempotencyKey: "job-1",
      now,
      candidateDispatcher,
      getAcceptedCounts,
      hasPendingPromotion,
    });
    expect(result.candidates).toBe(1);
    expect(getAcceptedCounts).toHaveBeenCalledWith({}, expect.objectContaining({ id: "venue-1" }), now);
    expect(hasPendingPromotion).toHaveBeenCalledWith({}, expect.objectContaining({ id: "venue-1" }), now);
    expect(candidateDispatcher).toHaveBeenCalledWith("trigger-1", expect.objectContaining({ id: "venue-1" }));
  });

  it("fails closed when a candidate dispatcher is missing", async () => {
    await expect(monitorVenues({ db: {} as never, provider: { getLive: vi.fn(), checkCoverage: vi.fn() }, idempotencyKey: "job-1", now })).rejects.toThrow("candidate dispatcher is required");
    expect(repositories.claimJobRun).not.toHaveBeenCalled();
  });

  it("does not process when another worker owns a running job", async () => {
    repositories.claimJobRun.mockResolvedValue({ run: { id: "job-1", state: "running" }, claimed: false });
    await expect(monitorVenues({ db: {} as never, provider: { getLive: vi.fn(), checkCoverage: vi.fn() }, idempotencyKey: "job-1", now, candidateDispatcher: vi.fn() })).rejects.toMatchObject({ code: "JOB_IN_PROGRESS" });
    expect(repositories.listActiveVenues).not.toHaveBeenCalled();
  });

  it("does not append audit or redispatch a reused trigger", async () => {
    repositories.findTriggerByIdempotencyKey.mockResolvedValue({ id: "trigger-1", decision: "candidate" });
    const candidateDispatcher = vi.fn().mockResolvedValue(undefined);
    const result = await monitorVenues({
      db: {} as never,
      provider: { getLive: vi.fn().mockResolvedValue({ observedAt: now, forecastedBusyness: 60, liveBusyness: 35, delta: -25, status: "ok" }), checkCoverage: vi.fn() },
      idempotencyKey: "job-1",
      now,
      candidateDispatcher,
      getAcceptedCounts: vi.fn().mockResolvedValue({ today: 0, week: 0 }),
      hasPendingPromotion: vi.fn().mockResolvedValue(false),
    });
    expect(result.candidates).toBe(1);
    expect(repositories.appendAuditEvent).not.toHaveBeenCalled();
    expect(candidateDispatcher).not.toHaveBeenCalled();
  });

  it("suppresses a stale, unavailable, or non-adjacent preceding reading", async () => {
    for (const previous of [
      [{ id: "reading-previous", observedAt: new Date("2026-07-12T03:00:00Z"), status: "ok", delta: -18 }],
      [{ id: "reading-previous", observedAt: new Date("2026-07-14T03:00:00Z"), status: "unavailable", delta: -18 }],
      [{ id: "reading-previous", observedAt: new Date("2026-07-14T00:00:00Z"), status: "ok", delta: -18 }],
    ]) {
      vi.clearAllMocks();
      setup(previous);
      const result = await monitorVenues({
        db: {} as never,
        provider: { getLive: vi.fn().mockResolvedValue({ observedAt: now, forecastedBusyness: 60, liveBusyness: 35, delta: -25, status: "ok" }), checkCoverage: vi.fn() },
        idempotencyKey: "job-1",
        now,
        candidateDispatcher: vi.fn(),
        getAcceptedCounts: vi.fn().mockResolvedValue({ today: 0, week: 0 }),
        hasPendingPromotion: vi.fn().mockResolvedValue(false),
      });
      expect(result.candidates).toBe(0);
      expect(result.suppressed).toBe(1);
    }
  });
});
