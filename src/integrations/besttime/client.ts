import { env } from "@/env";
import type { CoverageResult, LiveReading } from "@/domain/venues/types";
import type { BestTimeClientOptions, BestTimeProvider } from "./types";

type JsonRecord = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function firstRecord(body: JsonRecord, ...keys: string[]): JsonRecord {
  for (const key of keys) {
    const value = asRecord(body[key]);
    if (Object.keys(value).length > 0) return value;
  }
  return {};
}

function readString(body: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function readNumber(body: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function hasForecastSignal(value: JsonRecord): boolean {
  return Object.entries(value).some(([key, entry]) => {
    if (!/(forecast|busyness|coverage|prediction|weekday|hour|day)/i.test(key)) return false;
    if (typeof entry === "number") return Number.isFinite(entry);
    if (Array.isArray(entry)) return entry.length > 0;
    return Boolean(entry && typeof entry === "object" && Object.keys(entry as object).length > 0);
  });
}
function redactedMessage(error: unknown, privateKey?: string, publicKey?: string): string {
  const source = error instanceof Error ? error.message : String(error);
  let message = source;
  for (const secret of [privateKey, publicKey]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return message;
}

export class BestTimeProviderError extends Error {
  constructor(message: string, public readonly code = "provider_error") {
    super(message);
    this.name = "BestTimeProviderError";
  }
}

export function createBestTimeClient(options: BestTimeClientOptions = {}): BestTimeProvider {
  const baseUrl = (options.baseUrl ?? env.BESTTIME_BASE_URL).replace(/\/+$/, "");
  const privateKey = options.privateKey ?? env.BESTTIME_PRIVATE_KEY;
  const publicKey = options.publicKey ?? env.BESTTIME_PUBLIC_KEY;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function post(path: string, body: JsonRecord): Promise<JsonRecord> {
    if (!privateKey) throw new BestTimeProviderError("BestTime credentials unavailable", "credentials_unavailable");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...body, api_key_private: privateKey, ...(publicKey ? { api_key_public: publicKey } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new BestTimeProviderError(`BestTime request failed (${response.status})`, `http_${response.status}`);
      const parsed = await response.json();
      return asRecord(parsed);
    } catch (error) {
      if (controller.signal.aborted) throw new BestTimeProviderError("BestTime request timed out", "provider_timeout");
      if (error instanceof BestTimeProviderError) throw error;
      throw new BestTimeProviderError(`BestTime request failed: ${redactedMessage(error, privateKey, publicKey)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    async checkCoverage(input) {
      try {
        const body = await post("/forecasts", { venue_name: input.name, venue_address: input.address });
        const venue = firstRecord(body, "venue_info", "venue", "matched_venue");
        const analysis = firstRecord(body, "analysis", "forecast");
        const providerVenueId = readString(venue, "venue_id", "id") ?? readString(body, "venue_id", "id");
        const matchedName = readString(venue, "venue_name", "name") ?? readString(body, "venue_name");
        const matchedAddress = readString(venue, "venue_address", "address") ?? readString(body, "venue_address");
        const forecast = hasForecastSignal(analysis) ? analysis : undefined;
        if (!providerVenueId || !forecast) return { available: false, reason: "no_data" };
        const fetchedAt = now();
        return {
          available: true,
          providerVenueId,
          matchedName,
          matchedAddress,
          forecast,
          fetchedAt,
          // Forecasts are refreshed weekly; callers may override expiry when
          // they store a different retention policy.
          expiresAt: new Date(fetchedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        } satisfies CoverageResult;
      } catch (error) {
        if (error instanceof BestTimeProviderError && ["credentials_unavailable", "provider_timeout"].includes(error.code)) {
          return { available: false, reason: "provider_error" };
        }
        throw error;
      }
    },
    async getLive(providerVenueId) {
      try {
        const body = await post("/forecasts/live", { venue_id: providerVenueId });
        const analysis = firstRecord(body, "analysis", "live", "forecast");
        const forecastedBusyness = readNumber(analysis, "venue_forecasted_busyness", "forecasted_busyness");
        const liveBusyness = readNumber(analysis, "venue_live_busyness", "live_busyness");
        const delta = readNumber(analysis, "venue_live_forecasted_delta", "live_forecasted_delta", "delta");
        const observedValue = readString(analysis, "observed_at", "timestamp", "datetime");
        const observedAt = observedValue && !Number.isNaN(Date.parse(observedValue)) ? new Date(observedValue) : now();
        const providerRequestId = readString(body, "request_id", "id");
        if (forecastedBusyness === null || liveBusyness === null || delta === null) {
          return { observedAt, forecastedBusyness, liveBusyness, delta: null, status: "unavailable", providerRequestId };
        }
        return { observedAt, forecastedBusyness, liveBusyness, delta, status: "ok", providerRequestId } satisfies LiveReading;
      } catch (error) {
        if (error instanceof BestTimeProviderError && ["credentials_unavailable", "provider_timeout"].includes(error.code)) {
          return { observedAt: now(), forecastedBusyness: null, liveBusyness: null, delta: null, status: "unavailable", errorCode: error.code };
        }
        if (error instanceof BestTimeProviderError) throw error;
        throw new BestTimeProviderError(`BestTime request failed: ${redactedMessage(error, privateKey, publicKey)}`);
      }
    },
  };
}

export const createBestTimeProvider = createBestTimeClient;

