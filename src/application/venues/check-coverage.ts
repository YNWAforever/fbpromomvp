import { getLatestForecastSnapshot, createForecastSnapshot, findVenueById } from "@/db/repositories/venues";
import type { DatabaseExecutor } from "@/db/client";
import { scoreVenueMatch } from "@/domain/venues/match";
import type { CoverageResult, VenueMatchScore } from "@/domain/venues/types";
import type { BestTimeProvider } from "@/integrations/besttime/types";

const FORECAST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRESH_REUSE_MS = 5 * 60 * 1000;

export type CoverageCheckInput = {
  db: DatabaseExecutor;
  provider: BestTimeProvider;
  venueId: string;
  now?: Date;
};

export type CoverageCheckResult = {
  coverage: CoverageResult;
  match: VenueMatchScore;
  snapshot?: Awaited<ReturnType<typeof createForecastSnapshot>>;
  status: "available" | "unavailable" | "needs_match_review" | "blocked";
  notApplicable: boolean;
};

function unavailableResult(now: Date, reason: "no_data" | "provider_error"): CoverageCheckResult {
  return {
    coverage: { available: false, reason, fetchedAt: now },
    match: { decision: "blocked", totalScore: 0, nameScore: 0, addressScore: 0, normalizedSubmitted: { name: "", address: "" }, normalizedProvider: { name: "", address: "" } },
    status: "unavailable",
    notApplicable: true,
  };
}

/** Check and persist a venue's coverage without ever changing its lifecycle status. */
export async function checkVenueCoverage(input: CoverageCheckInput): Promise<CoverageCheckResult> {
  const now = input.now ?? new Date();
  const venue = await findVenueById(input.db, input.venueId);
  if (!venue) throw new Error(`venue ${input.venueId} not found`);

  const latest = await getLatestForecastSnapshot(input.db, input.venueId);
  if (latest && now.getTime() - latest.fetchedAt.getTime() >= 0 && now.getTime() - latest.fetchedAt.getTime() <= FRESH_REUSE_MS) {
    const coverage: CoverageResult = {
      available: Boolean(latest.providerVenueId && latest.payload && Object.keys(latest.payload).length > 0),
      providerVenueId: latest.providerVenueId ?? undefined,
      matchedName: latest.matchedName ?? undefined,
      matchedAddress: latest.matchedAddress ?? undefined,
      forecast: latest.payload,
      fetchedAt: latest.fetchedAt,
      expiresAt: latest.expiresAt,
      reason: latest.providerVenueId ? undefined : "no_data",
    };
    if (!coverage.available) return unavailableResult(now, coverage.reason ?? "no_data");
    const match = scoreVenueMatch(
      { name: venue.name, address: venue.address },
      { name: coverage.matchedName ?? "", address: coverage.matchedAddress ?? "" },
    );
    return { coverage, match, snapshot: latest, status: match.decision === "blocked" ? "blocked" : "needs_match_review", notApplicable: false };
  }

  let coverage: CoverageResult;
  try {
    coverage = await input.provider.checkCoverage({ name: venue.name, address: venue.address });
  } catch {
    return unavailableResult(now, "provider_error");
  }
  if (!coverage.available || !coverage.providerVenueId || !coverage.matchedName || !coverage.matchedAddress) {
    return unavailableResult(now, coverage.reason ?? "no_data");
  }

  const match = scoreVenueMatch(
    { name: venue.name, address: venue.address },
    { name: coverage.matchedName, address: coverage.matchedAddress },
  );
  const fetchedAt = coverage.fetchedAt ?? now;
  const expiresAt = coverage.expiresAt ?? new Date(fetchedAt.getTime() + FORECAST_TTL_MS);
  const snapshot = await createForecastSnapshot(input.db, {
    venueId: input.venueId,
    providerVenueId: coverage.providerVenueId,
    matchedName: coverage.matchedName,
    matchedAddress: coverage.matchedAddress,
    matchScore: match.totalScore,
    payload: coverage.forecast ?? {},
    fetchedAt,
    expiresAt,
  });
  return {
    coverage: { ...coverage, fetchedAt, expiresAt },
    match,
    snapshot,
    status: match.decision === "blocked" ? "blocked" : "needs_match_review",
    notApplicable: false,
  };
}

export const checkCoverage = checkVenueCoverage;

