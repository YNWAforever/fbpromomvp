import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findVenueById: vi.fn(),
  getLatestForecastSnapshot: vi.fn(),
  upsertVenueIntegration: vi.fn(),
  listActiveOfferTemplates: vi.fn(),
  listVenueIntegrations: vi.fn(),
  appendAuditEvent: vi.fn(),
}));
vi.mock("@/db/repositories/venues", () => repo);
vi.mock("@/db/repositories/audit", () => ({ appendAuditEvent: repo.appendAuditEvent }));

import { confirmMatch } from "./confirm-match";

describe("confirmMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findVenueById.mockResolvedValue({ id: "venue-1", name: "Harbour Cafe", address: "18 Queen's Road", businessHours: {} });
    repo.getLatestForecastSnapshot.mockResolvedValue(undefined);
    repo.upsertVenueIntegration.mockResolvedValue({ id: "integration-1", venueId: "venue-1", provider: "besttime", externalId: "bt-1" });
    repo.listActiveOfferTemplates.mockResolvedValue([]);
    repo.listVenueIntegrations.mockResolvedValue([]);
  });

  it("rejects a snapshot belonging to another venue", async () => {
    await expect(confirmMatch({
      db: {} as never,
      venueId: "venue-1",
      staff: { id: "staff-1", email: "ops@example.com", name: "Ops" },
      confirmed: true,
      snapshot: { venueId: "venue-2", providerVenueId: "bt-1", matchedName: "Harbour Cafe", matchedAddress: "18 Queen's Road", matchScore: 1, payload: { weekday: [1] }, expiresAt: new Date("2030-01-01") },
    })).rejects.toThrow("forecast snapshot must belong to venue venue-1");
    expect(repo.upsertVenueIntegration).not.toHaveBeenCalled();
  });

  it("appends an audit event for explicit confirmation", async () => {
    await confirmMatch({
      db: {} as never,
      venueId: "venue-1",
      staff: { id: "staff-1", email: "ops@example.com", name: "Ops" },
      confirmed: true,
      snapshot: { venueId: "venue-1", providerVenueId: "bt-1", matchedName: "Harbour Cafe", matchedAddress: "18 Queen's Road", matchScore: 1, payload: { weekday: [1] }, expiresAt: new Date("2030-01-01") },
      now: new Date("2026-07-13T00:00:00Z"),
    });
    expect(repo.appendAuditEvent).toHaveBeenCalledWith({}, expect.objectContaining({ actorType: "staff", actorId: "staff-1", action: "venue_match_confirmed", objectType: "venue", objectId: "venue-1" }));
  });
  it("records explicit confirmation but never auto-activates", async () => {
    const result = await confirmMatch({
      db: {} as never,
      venueId: "venue-1",
      staff: { id: "staff-1", email: "ops@example.com", name: "Ops" },
      confirmed: true,
      snapshot: { venueId: "venue-1", providerVenueId: "bt-1", matchedName: "Harbour Cafe", matchedAddress: "18 Queen's Road", matchScore: 1, payload: { weekday: [1] }, expiresAt: new Date("2030-01-01") },
    });
    expect(result.confirmed).toBe(true);
    expect(result.activation.autoActivated).toBe(false);
    expect(result.activation.allowed).toBe(false);
    expect(repo.upsertVenueIntegration).toHaveBeenCalledWith({}, expect.objectContaining({ venueId: "venue-1", externalId: "bt-1" }));
  });
});
