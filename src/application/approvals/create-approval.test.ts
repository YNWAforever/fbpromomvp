import { describe, expect, it, vi } from "vitest";
import { createApprovalForTrigger } from "./create-approval";

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
      createCopyCandidates: vi.fn().mockImplementation(async (_db, values) => { insertedCandidates.push(...values); return values.map((value: Record<string, unknown>, index: number) => ({ ...value, id: `candidate-${index + 1}` })); }),
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
