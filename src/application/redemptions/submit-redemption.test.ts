import { describe, expect, it, vi } from "vitest";
import { signScopedToken } from "@/lib/security/signed-token";
import { submitRedemption } from "./submit-redemption";

describe("submitRedemption", () => {
  const secret = "redemption-secret";
  const token = signScopedToken({ scope: "promotion", subject: "promotion-1", exp: 1_790_000_000 }, secret);
  const promotion = { id: "promotion-1", venueId: "venue-1", state: "accepted", campaignCode: "OPR-ABC", body: "offer", acceptedAt: new Date("2026-07-14T06:00:00.000Z"), sentCount: 12 };

  it("stores the first aggregate as revision one and audits the change", async () => {
    const upsert = vi.fn().mockResolvedValue({ promotionId: "promotion-1", count: 8, note: "busy", revision: 1 });
    const audit = vi.fn().mockResolvedValue(undefined);
    const result = await submitRedemption({ db: {} as never, token, secret, count: 8, note: "busy", now: new Date("2026-07-14T10:00:00.000Z"), repositories: { getPromotion: vi.fn().mockResolvedValue(promotion), getRedemptionReport: vi.fn().mockResolvedValue(undefined), upsertRedemptionReport: upsert, appendAuditEvent: audit } });
    expect(upsert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ promotionId: "promotion-1", count: 8, note: "busy", revision: 1 }));
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "redemption_reported", metadata: expect.objectContaining({ oldCount: null, newCount: 8, revision: 1 }) }));
    expect(result).toMatchObject({ count: 8, revision: 1 });
  });

  it("increments revision only when count or note changes", async () => {
    const upsert = vi.fn().mockResolvedValue({ promotionId: "promotion-1", count: 9, note: "corrected", revision: 2 });
    const existing = { promotionId: "promotion-1", count: 8, note: "busy", revision: 1 };
    const result = await submitRedemption({ db: {} as never, token, secret, count: 9, note: "corrected", repositories: { getPromotion: vi.fn().mockResolvedValue(promotion), getRedemptionReport: vi.fn().mockResolvedValue(existing), upsertRedemptionReport: upsert, appendAuditEvent: vi.fn() } });
    expect(upsert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ revision: 2 }));
    expect(result).toMatchObject({ revision: 2 });
  });

  it("rejects invalid counts, oversized notes, and wrong token scopes", async () => {
    const repositories = { getPromotion: vi.fn().mockResolvedValue(promotion), getRedemptionReport: vi.fn(), upsertRedemptionReport: vi.fn(), appendAuditEvent: vi.fn() };
    await expect(submitRedemption({ db: {} as never, token, secret, count: -1, repositories })).rejects.toThrow("count");
    await expect(submitRedemption({ db: {} as never, token, secret, count: 1, note: "x".repeat(501), repositories })).rejects.toThrow("note");
    const wrong = signScopedToken({ scope: "report", subject: "promotion-1", exp: 1_790_000_000 }, secret);
    await expect(submitRedemption({ db: {} as never, token: wrong, secret, count: 1, repositories })).rejects.toThrow("token");
    expect(repositories.upsertRedemptionReport).not.toHaveBeenCalled();
  });
});