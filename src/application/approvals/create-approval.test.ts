import { describe, expect, it, vi } from "vitest";
import { createApprovalForTrigger } from "./create-approval";
import { OPT_OUT_TEXT } from "@/domain/copy/validate";

describe("createApprovalForTrigger", () => {
  it("persists exactly three candidates, sends approval, and is idempotent by trigger", async () => {
    const now = new Date("2026-07-14T10:00:00.000Z");
    const insertedCandidates: Array<Record<string, unknown>> = [];
    const insertedApprovals: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const db = {} as never;
    const copyProvider = { generate: vi.fn().mockResolvedValue([
      { body: "消費滿 HK$100 即減 HK$20。", source: "model", valid: true, validationErrors: [] },
    ]) };
    const messagingProvider = { sendApproval: vi.fn().mockResolvedValue({ messageId: "woz-msg-1" }) };
    const repositories = {
      findApprovalByTriggerId: vi.fn().mockResolvedValue(undefined),
      createCopyCandidates: vi.fn().mockImplementation(async (_db, values) => { insertedCandidates.push(...values); return [...values].reverse().map((value: Record<string, unknown>, index: number) => ({ ...value, id: `candidate-${index + 1}` })); }),
      createApproval: vi.fn().mockImplementation(async (_db, value) => { const approval = { ...value, id: "approval-1" }; insertedApprovals.push(approval); return approval; }),
      updateApproval: vi.fn().mockImplementation(async (_db, _id, value) => { updates.push(value); return { id: "approval-1", ...value }; }),
      appendAuditEvent: vi.fn(),
    };
    const result = await createApprovalForTrigger({ db, triggerId: "trigger-1", venueId: "venue-1", memberId: "member-1", venueName: "Harbour Cafe", facts: { headline: "靜市", benefit: "消費滿 HK$100 即減 HK$20", conditions: ["今日有效"] }, now, copyProvider, messagingProvider, repositories });
    expect(insertedCandidates).toHaveLength(3);
    expect(insertedCandidates.every((candidate) => candidate.triggerId === "trigger-1")).toBe(true);
    expect(insertedApprovals[0]).toMatchObject({ venueId: "venue-1", triggerId: "trigger-1", state: "pending" });
    expect(updates).toContainEqual({ providerMessageId: "woz-msg-1" });
    expect(messagingProvider.sendApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalId: "approval-1", memberId: "member-1", candidates: expect.any(Array) }));
    expect(result.approval.id).toBe("approval-1");
    expect(insertedApprovals[0]?.expiresAt).toEqual(new Date("2026-07-14T10:15:00.000Z"));
    const sent = vi.mocked(messagingProvider.sendApproval).mock.calls[0]?.[0];
    expect(sent?.expiresAt).toBe("2026-07-14T10:15:00.000Z");
    expect(insertedCandidates.every((candidate) => String(candidate.body).includes("2026-07-14T12:00:00.000Z"))).toBe(true);
    expect(insertedCandidates.every((candidate) => String(candidate.body).includes(OPT_OUT_TEXT))).toBe(true);
    expect(insertedCandidates.map((candidate) => candidate.ordinal)).toEqual([0, 1, 2]);
    expect(insertedCandidates.every((candidate) => candidate.version === 1)).toBe(true);
  });

  it("marks a send failure without creating a promotion", async () => {
    const messagingProvider = { sendApproval: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    const repositories = {
      findApprovalByTriggerId: vi.fn().mockResolvedValue(undefined),
      createCopyCandidates: vi.fn().mockResolvedValue([{ id: "candidate-1" }, { id: "candidate-2" }, { id: "candidate-3" }]),
      createApproval: vi.fn().mockResolvedValue({ id: "approval-1", venueId: "venue-1", triggerId: "trigger-1", state: "pending" }),
      updateApproval: vi.fn().mockResolvedValue({ id: "approval-1", state: "send_failed" }),
      appendAuditEvent: vi.fn(),
    };
    await expect(createApprovalForTrigger({ db: {} as never, triggerId: "trigger-1", venueId: "venue-1", memberId: "member-1", venueName: "Harbour Cafe", facts: { headline: "靜市", benefit: "消費滿 HK$100 即減 HK$20", conditions: [] }, copyProvider: { generate: vi.fn().mockResolvedValue([]) }, messagingProvider, repositories })).resolves.toMatchObject({ approval: { id: "approval-1" } });
    expect(repositories.updateApproval).toHaveBeenCalledWith(expect.anything(), "approval-1", { state: "send_failed" });
    expect(repositories.appendAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "approval_send_failed" }));
  });

  it("retries a prior send failure with the same provider request key", async () => {
    const findApprovalByTriggerId = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "approval-1", venueId: "venue-1", triggerId: "trigger-1", state: "send_failed" });
    const createApproval = vi.fn().mockResolvedValue({ id: "approval-1", venueId: "venue-1", triggerId: "trigger-1", state: "pending" });
    const messagingProvider = { sendApproval: vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ messageId: "woz-msg-retry" }) };
    const repositories = {
      findApprovalByTriggerId,
      createApproval,
      listCopyCandidates: vi.fn().mockResolvedValue([{ id: "candidate-1", body: "candidate body 1", ordinal: 0, version: 1 }, { id: "candidate-2", body: "candidate body 2", ordinal: 1, version: 1 }, { id: "candidate-3", body: "candidate body 3", ordinal: 2, version: 1 }]),
      findAuditEventByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
      createCopyCandidates: vi.fn().mockResolvedValue([{ id: "candidate-1" }, { id: "candidate-2" }, { id: "candidate-3" }]),
      updateApproval: vi.fn().mockResolvedValue({ id: "approval-1" }),
      appendAuditEvent: vi.fn(),
    };
    const input = {
      db: {} as never,
      triggerId: "trigger-1",
      venueId: "venue-1",
      memberId: "member-1",
      venueName: "Harbour Cafe",
      facts: { headline: "promotion", benefit: "discount HK$100 minus HK$20", conditions: [] },
      copyProvider: { generate: vi.fn().mockResolvedValue([]) },
      messagingProvider,
      repositories,
    };

    await createApprovalForTrigger(input);
    await expect(createApprovalForTrigger(input)).resolves.toMatchObject({ approval: { id: "approval-1" } });
    expect(messagingProvider.sendApproval).toHaveBeenCalledTimes(2);
    expect(messagingProvider.sendApproval.mock.calls[0]?.[0].requestKey).toBe("approval:venue-1:trigger-1");
    expect(messagingProvider.sendApproval.mock.calls[1]?.[0].requestKey).toBe("approval:venue-1:trigger-1");
  });

  it("does not classify local persistence failure after provider acceptance as a retryable provider send", async () => {
    const messagingProvider = { sendApproval: vi.fn().mockResolvedValue({ messageId: "woz-msg-accepted" }) };
    const updateApproval = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const repositories = {
      findApprovalByTriggerId: vi.fn().mockResolvedValue(undefined),
      createCopyCandidates: vi.fn().mockResolvedValue([{ id: "candidate-1" }, { id: "candidate-2" }, { id: "candidate-3" }]),
      createApproval: vi.fn().mockResolvedValue({ id: "approval-1", venueId: "venue-1", triggerId: "trigger-1", state: "pending" }),
      updateApproval,
      appendAuditEvent: vi.fn(),
    };
    await expect(createApprovalForTrigger({
      db: {} as never,
      triggerId: "trigger-1",
      venueId: "venue-1",
      memberId: "member-1",
      venueName: "Harbour Cafe",
      facts: { headline: "promotion", benefit: "discount HK$100 minus HK$20", conditions: [] },
      copyProvider: { generate: vi.fn().mockResolvedValue([]) },
      messagingProvider,
      repositories,
    })).rejects.toMatchObject({ code: "send_persistence_failed" });
    expect(messagingProvider.sendApproval).toHaveBeenCalledTimes(1);
    expect(updateApproval).toHaveBeenCalledTimes(1);
    expect(repositories.appendAuditEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "approval_send_failed" }));
  });

  it("records and reconciles an accepted provider send when local persistence initially fails", async () => {
    const existing = { id: "approval-1", venueId: "venue-1", triggerId: "trigger-1", state: "pending" };
    const findApprovalByTriggerId = vi.fn().mockResolvedValue(existing);
    const findAuditEventByIdempotencyKey = vi.fn().mockResolvedValue({
      action: "approval_send_persistence_failed",
      objectId: "approval-1",
      idempotencyKey: "approval:venue-1:trigger-1:accepted",
      metadata: { state: "provider_accepted_local_persistence_pending", providerMessageId: "woz-msg-accepted" },
    });
    const updateApproval = vi.fn().mockResolvedValue({ id: "approval-1", providerMessageId: "woz-msg-accepted" });
    const appendAuditEvent = vi.fn();
    const messagingProvider = { sendApproval: vi.fn() };

    const result = await createApprovalForTrigger({
      db: {} as never,
      triggerId: "trigger-1",
      venueId: "venue-1",
      memberId: "member-1",
      venueName: "Harbour Cafe",
      facts: { headline: "promotion", benefit: "discount HK$100 minus HK$20", conditions: [] },
      copyProvider: { generate: vi.fn() },
      messagingProvider,
      repositories: { findApprovalByTriggerId, findAuditEventByIdempotencyKey, updateApproval, appendAuditEvent },
    });

    expect(result.approval).toMatchObject({ id: "approval-1", providerMessageId: "woz-msg-accepted" });
    expect(messagingProvider.sendApproval).not.toHaveBeenCalled();
    expect(updateApproval).toHaveBeenCalledWith(expect.anything(), "approval-1", { providerMessageId: "woz-msg-accepted" });
    expect(appendAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "approval_requested", idempotencyKey: "approval:venue-1:trigger-1:requested" }));
  });

  it("passes venue scope to approval lookups", async () => {
    const findApprovalByTriggerId = vi.fn().mockResolvedValue({ id: "approval-existing", venueId: "venue-1", triggerId: "trigger-1", state: "pending" });
    await createApprovalForTrigger({
      db: {} as never,
      triggerId: "trigger-1",
      venueId: "venue-1",
      memberId: "member-1",
      venueName: "Harbour Cafe",
      facts: { headline: "promotion", benefit: "discount HK$100 minus HK$20", conditions: [] },
      copyProvider: { generate: vi.fn() },
      messagingProvider: { sendApproval: vi.fn() },
      repositories: { findApprovalByTriggerId, findAuditEventByIdempotencyKey: vi.fn().mockResolvedValue(undefined) },
    });
    expect(findApprovalByTriggerId).toHaveBeenCalledWith(expect.anything(), "trigger-1", "venue-1");
  });
  it("does not persist candidates or send when another request wins the approval uniqueness race", async () => {
    const racedApproval = { id: "approval-raced", venueId: "venue-1", triggerId: "trigger-1", state: "pending" };
    const findApprovalByTriggerId = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(racedApproval);
    const createCopyCandidates = vi.fn();
    const copyProvider = { generate: vi.fn().mockResolvedValue([]) };
    const createApproval = vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    const messagingProvider = { sendApproval: vi.fn() };
    const result = await createApprovalForTrigger({
      db: {} as never,
      triggerId: "trigger-1",
      venueId: "venue-1",
      memberId: "member-1",
      venueName: "Harbour Cafe",
      facts: { headline: "靜市", benefit: "消費滿 HK$100 即減 HK$20", conditions: [] },
      copyProvider,
      messagingProvider,
      repositories: { findApprovalByTriggerId, createCopyCandidates, createApproval },
    });

    expect(result.approval).toEqual(racedApproval);
    expect(copyProvider.generate).not.toHaveBeenCalled();
    expect(createCopyCandidates).not.toHaveBeenCalled();
    expect(messagingProvider.sendApproval).not.toHaveBeenCalled();
  });
});
