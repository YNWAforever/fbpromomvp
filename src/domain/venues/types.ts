export type VenueIdentity = {
  name: string;
  address: string;
};

export type VenueMatchDecision = "blocked" | "manual_review";

export type VenueMatchScore = {
  decision: VenueMatchDecision;
  totalScore: number;
  nameScore: number;
  addressScore: number;
  normalizedSubmitted: VenueIdentity;
  normalizedProvider: VenueIdentity;
};

export type CoverageResult = {
  available: boolean;
  providerVenueId?: string;
  matchedName?: string;
  matchedAddress?: string;
  forecast?: Record<string, unknown>;
  reason?: "no_data" | "provider_error" | "provider_timeout" | "credentials_unavailable";
  fetchedAt?: Date;
  expiresAt?: Date;
};

export type LiveReading = {
  observedAt: Date;
  forecastedBusyness: number | null;
  liveBusyness: number | null;
  delta: number | null;
  status: "ok" | "unavailable";
  providerRequestId?: string;
  errorCode?: string;
};

export type CoverageWindow = {
  start: string;
  end: string;
};

export type NormalizedBusinessHours = Record<string, CoverageWindow[]>;
