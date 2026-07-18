import { describe, expect, it, vi } from "vitest";
import { runBestTimeSmoke } from "./besttime";

describe("BestTime smoke", () => {
  it("prints the matched provider identity when coverage is available", async () => {
    const write = vi.fn();
    const exitCode = await runBestTimeSmoke({
      environment: { SMOKE_VENUE_NAME: "Harbour Cafe", SMOKE_VENUE_ADDRESS: "18 Pier Road, Central" },
      provider: { checkCoverage: vi.fn().mockResolvedValue({ available: true, providerVenueId: "bt-1", matchedName: "Harbour Cafe", matchedAddress: "18 Pier Road" }) },
      write,
    });

    expect(exitCode).toBe(0);
    expect(write).toHaveBeenCalledWith("available=true providerVenueId=bt-1 matchedIdentity=Harbour Cafe | 18 Pier Road");
  });

  it("exits one and prints no secrets when coverage is unavailable", async () => {
    const write = vi.fn();
    const exitCode = await runBestTimeSmoke({
      environment: { SMOKE_VENUE_NAME: "Harbour Cafe", SMOKE_VENUE_ADDRESS: "18 Pier Road, Central" },
      provider: { checkCoverage: vi.fn().mockResolvedValue({ available: false, reason: "no_data" }) },
      write,
    });

    expect(exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith("available=false providerVenueId=none matchedIdentity=none");
  });
});
