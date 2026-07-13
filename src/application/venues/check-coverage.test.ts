import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findVenueById: vi.fn(),
  getLatestForecastSnapshot: vi.fn(),
  createForecastSnapshot: vi.fn(),
}));
vi.mock("@/db/repositories/venues", () => repo);

import { checkVenueCoverage } from "./check-coverage";

describe("checkVenueCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findVenueById.mockResolvedValue({ id: "venue-1", name: "Harbour Cafe", address: "18 Queen's Road", businessHours: {} });
    repo.getLatestForecastSnapshot.mockResolvedValue(undefined);
    repo.createForecastSnapshot.mockImplementation(async (_db: unknown, values: unknown) => ({ id: "snapshot-1", ...(values as object) }));
  });

  it("returns Not applicable and does not store a fake zero when provider coverage is unavailable", async () => {
    const provider = { checkCoverage: vi.fn().mockResolvedValue({ available: false, reason: "no_data" as const }), getLive: vi.fn() };
    const result = await checkVenueCoverage({ db: {} as never, provider, venueId: "venue-1", now: new Date("2026-07-13T00:00:00Z") });
    expect(result).toMatchObject({ status: "unavailable", notApplicable: true });
    expect(result.coverage.forecast).toBeUndefined();
    expect(repo.createForecastSnapshot).not.toHaveBeenCalled();
  });

  it("stores the matched identity and score under the requested venue", async () => {
    const provider = {
      checkCoverage: vi.fn().mockResolvedValue({ available: true, providerVenueId: "bt-1", matchedName: "Harbour Cafe Ltd", matchedAddress: "18 Queen's Road", forecast: { weekday: [1, 2] } }),
      getLive: vi.fn(),
    };
    const result = await checkVenueCoverage({ db: {} as never, provider, venueId: "venue-1", now: new Date("2026-07-13T00:00:00Z") });
    expect(result.status).toBe("needs_match_review");
    expect(repo.createForecastSnapshot).toHaveBeenCalledWith({}, expect.objectContaining({ venueId: "venue-1", providerVenueId: "bt-1" }));
  });
});
