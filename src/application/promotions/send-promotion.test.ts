import { describe, expect, it, vi } from "vitest";
import { sendPromotion } from "./send-promotion";

describe("sendPromotion safety", () => {
  const base = {
    id: "promotion-1",
    state: "send_failed",
    attempts: 1,
    body: "Quiet offer {{code}} until {{expiresAt}}",
    campaignCode: "OPR-ABC123",
    validUntil: new Date("2026-07-14T12:00:00.000Z"),
    providerBroadcastId: null,
    memberCount: null,
    sentCount: null,
  };

  it("reaches send_failed retries and persists the incremented attempt", async () => {
    const update = vi.fn().mockImplementation(async (_db, _id, values) => ({ ...base, ...values }));
    const provider = { createBroadcast: vi.fn().mockResolvedValue({ broadcastId: "broadcast-1", memberCount: 4, sentCount: 4 }) };
    const result = await sendPromotion({ db: {} as never, promotionId: "promotion-1", audienceId: "test-audience", provider, repositories: { getPromotion: vi.fn().mockResolvedValue(base), updatePromotion: update, appendAuditEvent: vi.fn() } });
    expect(provider.createBroadcast).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.anything(), "promotion-1", expect.objectContaining({ state: "sending", attempts: 2 }));
    expect(result).toMatchObject({ state: "accepted", attempts: 2 });
  });

  it("builds provider messages from approved promotion content", async () => {
    const update = vi.fn().mockImplementation(async (_db, _id, values) => ({ ...base, ...values }));
    const provider = { createBroadcast: vi.fn().mockResolvedValue({ broadcastId: "broadcast-1", memberCount: null, sentCount: null }) };
    await sendPromotion({ db: {} as never, promotionId: "promotion-1", audienceId: "test-audience", messages: { body: "attacker supplied text" }, provider, repositories: { getPromotion: vi.fn().mockResolvedValue({ ...base, state: "queued", attempts: 0 }), updatePromotion: update, appendAuditEvent: vi.fn() } });
    expect(provider.createBroadcast).toHaveBeenCalledWith(expect.objectContaining({ messages: { body: "Quiet offer OPR-ABC123 until 2026-07-14T12:00:00.000Z", campaignCode: "OPR-ABC123", expiresAt: "2026-07-14T12:00:00.000Z" } }));
  });

  it("does not call the provider again after an accepted receipt is persisted", async () => {
    const provider = { createBroadcast: vi.fn() };
    const current = { ...base, state: "accepted", attempts: 2, providerBroadcastId: "broadcast-1", providerReceipt: { broadcastId: "broadcast-1", memberCount: 4, sentCount: 4 } };
    const result = await sendPromotion({ db: {} as never, promotionId: "promotion-1", audienceId: "test-audience", provider, repositories: { getPromotion: vi.fn().mockResolvedValue(current), updatePromotion: vi.fn(), appendAuditEvent: vi.fn() } });
    expect(provider.createBroadcast).not.toHaveBeenCalled();
    expect(result.receipt).toMatchObject({ broadcastId: "broadcast-1" });
  });

  it("stops at three persisted attempts", async () => {
    const provider = { createBroadcast: vi.fn() };
    const audit = vi.fn();
    await expect(sendPromotion({ db: {} as never, promotionId: "promotion-1", audienceId: "test-audience", provider, repositories: { getPromotion: vi.fn().mockResolvedValue({ ...base, attempts: 3 }), updatePromotion: vi.fn(), appendAuditEvent: audit } })).rejects.toThrow("retry limit reached");
    expect(provider.createBroadcast).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "promotion_retry_exhausted" }));
  });

  it("does not mark provider success as send_failed when accepted persistence fails", async () => {
    const receipt = { broadcastId: "broadcast-accepted", memberCount: 4, sentCount: 4 };
    const updateIfState = vi.fn()
      .mockResolvedValueOnce({ ...base, state: "sending", attempts: 2 })
      .mockRejectedValueOnce(new Error("database unavailable"));
    const audit = vi.fn().mockResolvedValue(undefined);
    const provider = { createBroadcast: vi.fn().mockResolvedValue(receipt) };
    await expect(sendPromotion({
      db: {} as never,
      promotionId: "promotion-1",
      audienceId: "test-audience",
      provider,
      repositories: { getPromotion: vi.fn().mockResolvedValue(base), updatePromotionIfState: updateIfState, appendAuditEvent: audit },
    })).rejects.toMatchObject({ code: "send_persistence_failed" });
    expect(provider.createBroadcast).toHaveBeenCalledTimes(1);
    expect(updateIfState).toHaveBeenNthCalledWith(2, expect.anything(), "promotion-1", "sending", expect.objectContaining({ state: "accepted", providerBroadcastId: receipt.broadcastId }));
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "promotion_send_persistence_failed" }));
    expect(audit).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "promotion_send_failed" }));
  });

  it("reconciles an accepted receipt marker without sending to the provider again", async () => {
    const receipt = { broadcastId: "broadcast-accepted", memberCount: 4, sentCount: 4 };
    const updateIfState = vi.fn().mockResolvedValue({ ...base, state: "accepted", attempts: 2, providerReceipt: receipt });
    const provider = { createBroadcast: vi.fn() };
    const result = await sendPromotion({
      db: {} as never,
      promotionId: "promotion-1",
      audienceId: "test-audience",
      provider,
      repositories: {
        getPromotion: vi.fn().mockResolvedValue({ ...base, state: "sending", attempts: 2 }),
        updatePromotionIfState: updateIfState,
        findAuditEventByIdempotencyKey: vi.fn().mockResolvedValue({ metadata: { providerReceipt: receipt } }),
        appendAuditEvent: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(provider.createBroadcast).not.toHaveBeenCalled();
    expect(updateIfState).toHaveBeenCalledWith(expect.anything(), "promotion-1", "sending", expect.objectContaining({ state: "accepted", providerBroadcastId: receipt.broadcastId }));
    expect(result).toMatchObject({ state: "accepted", receipt });
  });
});
