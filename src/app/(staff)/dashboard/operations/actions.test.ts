import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireStaff: vi.fn() }));
const database = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const promotions = vi.hoisted(() => ({
  getPromotion: vi.fn(),
  updatePromotionIfState: vi.fn(),
}));
const venues = vi.hoisted(() => ({ listVenueIntegrations: vi.fn() }));
const audit = vi.hoisted(() => ({ appendAuditEvent: vi.fn() }));
const sender = vi.hoisted(() => ({ sendPromotion: vi.fn() }));
const provider = vi.hoisted(() => ({ createWozTellOpenApiClient: vi.fn() }));

vi.mock("@/lib/auth/require-staff", () => auth);
vi.mock("@/db/client", () => database);
vi.mock("@/db/repositories/promotions", () => promotions);
vi.mock("@/db/repositories/venues", () => venues);
vi.mock("@/db/repositories/audit", () => audit);
vi.mock("@/application/promotions/send-promotion", () => sender);
vi.mock("@/integrations/woztell/open-api-client", () => provider);

import { cancelPromotionAction, pausePromotionAction, retryPromotionAction } from "./actions";

const staff = { id: "staff-1", email: "ops@example.com", name: "Ops" };
const basePromotion = {
  id: "promotion-1",
  venueId: "venue-1",
  state: "send_failed",
  attempts: 1,
  body: "Offer {{code}} until {{expiresAt}}",
  campaignCode: "OPR-ABC",
  validUntil: new Date("2026-07-17T13:00:00.000Z"),
};

function form(promotionId: string) {
  const value = new FormData();
  value.set("promotionId", promotionId);
  return value;
}

describe("staff promotion operations actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireStaff.mockResolvedValue(staff);
    database.withDatabase.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => work({ transaction: async (transactionWork: (tx: unknown) => Promise<unknown>) => transactionWork({}) }));
    promotions.getPromotion.mockResolvedValue(basePromotion);
    promotions.updatePromotionIfState.mockResolvedValue({ ...basePromotion, state: "cancelled" });
    venues.listVenueIntegrations.mockResolvedValue([{ provider: "woztell", metadata: { audienceReference: "test-audience" } }]);
    audit.appendAuditEvent.mockResolvedValue({ id: "audit-1" });
    sender.sendPromotion.mockResolvedValue({ promotion: { ...basePromotion, state: "accepted" }, state: "accepted", attempts: 2 });
    provider.createWozTellOpenApiClient.mockReturnValue({ createBroadcast: vi.fn() });
  });

  it("authenticates before opening the database or reading a promotion", async () => {
    const error = new Error("Staff access denied");
    auth.requireStaff.mockRejectedValue(error);

    await expect(retryPromotionAction(form("promotion-1"))).rejects.toThrow("Staff access denied");
    expect(database.withDatabase).not.toHaveBeenCalled();
    expect(promotions.getPromotion).not.toHaveBeenCalled();
    expect(sender.sendPromotion).not.toHaveBeenCalled();
  });

  it("only retries a promotion in send_failed state", async () => {
    promotions.getPromotion.mockResolvedValue({ ...basePromotion, state: "accepted" });

    await expect(retryPromotionAction(form("promotion-1"))).resolves.toMatchObject({ ok: false, code: "invalid_state" });
    expect(venues.listVenueIntegrations).not.toHaveBeenCalled();
    expect(sender.sendPromotion).not.toHaveBeenCalled();
  });

  it("rejects an exhausted send_failed promotion without calling the retry service", async () => {
    promotions.getPromotion.mockResolvedValue({ ...basePromotion, attempts: 3 });

    await expect(retryPromotionAction(form("promotion-1"))).resolves.toMatchObject({ ok: false, code: "invalid_state" });
    expect(sender.sendPromotion).not.toHaveBeenCalled();
  });
  it("passes the staff-approved audience to the Task 7 retry service", async () => {
    await expect(retryPromotionAction(form("promotion-1"))).resolves.toMatchObject({ ok: true, state: "accepted" });
    expect(sender.sendPromotion).toHaveBeenCalledWith(expect.objectContaining({
      db: expect.anything(),
      promotionId: "promotion-1",
      audienceId: "test-audience",
      provider: expect.anything(),
    }));
  });

  it.each(["queued", "send_failed"] as const)("cancels a %s promotion with a conditional transition and audit", async (state) => {
    promotions.getPromotion.mockResolvedValue({ ...basePromotion, state });

    await expect(cancelPromotionAction(form("promotion-1"))).resolves.toMatchObject({ ok: true, state: "cancelled" });
    expect(promotions.updatePromotionIfState).toHaveBeenCalledWith(expect.anything(), "promotion-1", state, { state: "cancelled" });
    expect(audit.appendAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorType: "staff",
      actorId: "staff-1",
      action: "promotion_cancelled",
      objectType: "promotion",
      objectId: "promotion-1",
    }));
  });

  it("blocks cancellation outside queued and send_failed", async () => {
    promotions.getPromotion.mockResolvedValue({ ...basePromotion, state: "accepted" });

    await expect(cancelPromotionAction(form("promotion-1"))).resolves.toMatchObject({ ok: false, code: "invalid_state" });
    expect(promotions.updatePromotionIfState).not.toHaveBeenCalled();
    expect(audit.appendAuditEvent).not.toHaveBeenCalled();
  });

  it("propagates cancellation audit failures through the transaction", async () => {
    audit.appendAuditEvent.mockRejectedValue(new Error("audit unavailable"));

    await expect(cancelPromotionAction(form("promotion-1"))).rejects.toThrow("audit unavailable");
    expect(promotions.updatePromotionIfState).toHaveBeenCalledWith(expect.anything(), "promotion-1", "send_failed", { state: "cancelled" });
  });
  it("records pause with the authenticated staff identity without calling a provider", async () => {
    await expect(pausePromotionAction(form("promotion-1"))).resolves.toMatchObject({ ok: true, action: "paused" });
    expect(audit.appendAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorType: "staff",
      actorId: "staff-1",
      action: "promotion_paused",
      objectType: "promotion",
      objectId: "promotion-1",
    }));
    expect(provider.createWozTellOpenApiClient).not.toHaveBeenCalled();
    expect(sender.sendPromotion).not.toHaveBeenCalled();
  });
});
