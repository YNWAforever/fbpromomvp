import { describe, expect, it, vi } from "vitest";
import { runWozTellSmoke } from "./woztell";

const completeEnvironment = {
  VERCEL_ENV: "preview",
  WOZTELL_PRIORITY_GROUP_ID: "test-priority-group",
  SMOKE_WOZTELL_MEMBER_ID: "test-member-1",
};

describe("WozTell smoke", () => {
  it("sends only a test approval and prints its provider message ID", async () => {
    const write = vi.fn();
    const sendApproval = vi.fn().mockResolvedValue({ messageId: "woz-msg-1" });
    const exitCode = await runWozTellSmoke({ environment: completeEnvironment, provider: { sendApproval }, write, now: () => new Date("2026-07-18T09:00:00.000Z") });

    expect(exitCode).toBe(0);
    expect(sendApproval).toHaveBeenCalledWith(expect.objectContaining({ memberId: "test-member-1", candidates: expect.any(Array) }));
    expect(write).toHaveBeenCalledWith("providerMessageId=woz-msg-1");
  });

  it("refuses production before contacting WozTell", async () => {
    const sendApproval = vi.fn();
    await expect(runWozTellSmoke({ environment: { ...completeEnvironment, VERCEL_ENV: "production" }, provider: { sendApproval }, write: vi.fn() })).rejects.toThrow("refuses production");
    expect(sendApproval).not.toHaveBeenCalled();
  });

  it("requires both the Priority Group and member ID", async () => {
    await expect(runWozTellSmoke({ environment: { VERCEL_ENV: "preview" }, provider: { sendApproval: vi.fn() }, write: vi.fn() })).rejects.toThrow("WOZTELL_PRIORITY_GROUP_ID");
  });
});
