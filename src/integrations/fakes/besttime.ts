import coverageFixture from "@/test/fixtures/besttime/coverage.json";
import liveReadingsFixture from "@/test/fixtures/besttime/live-readings.json";
import type { CoverageResult, LiveReading } from "@/domain/venues/types";
import type { BestTimeProvider } from "@/integrations/besttime/types";

type FixtureReading = Omit<LiveReading, "observedAt"> & { observedAt: string };

/** Deterministic test-only BestTime adapter. It never reads credentials or calls a network. */
export class FakeBestTimeProvider implements BestTimeProvider {
  private readingIndex = 0;

  async checkCoverage(input: { name: string; address: string }): Promise<CoverageResult> {
    return {
      ...coverageFixture,
      matchedName: input.name.trim() || coverageFixture.matchedName,
      matchedAddress: input.address.trim() || coverageFixture.matchedAddress,
      forecast: { ...coverageFixture.forecast },
      fetchedAt: new Date("2026-07-14T02:00:00.000Z"),
      expiresAt: new Date("2026-07-21T02:00:00.000Z"),
    };
  }

  async getLive(providerVenueId: string): Promise<LiveReading> {
    if (providerVenueId !== coverageFixture.providerVenueId) {
      return {
        observedAt: new Date("2026-07-14T04:00:00.000Z"),
        forecastedBusyness: null,
        liveBusyness: null,
        delta: null,
        status: "unavailable",
        errorCode: "unknown_fake_venue",
      };
    }
    const readings = liveReadingsFixture as FixtureReading[];
    const fixture = readings[Math.min(this.readingIndex, readings.length - 1)]!;
    this.readingIndex += 1;
    return { ...fixture, observedAt: new Date(fixture.observedAt) };
  }
}

export function createFakeBestTimeProvider() {
  return new FakeBestTimeProvider();
}
