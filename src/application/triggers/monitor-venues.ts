import { DateTime } from "luxon";
import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent } from "@/db/repositories/audit";
import { claimJobRun, findJobRunByIdempotencyKey, updateJobRun } from "@/db/repositories/jobs";
import {
  createLiveReading,
  createTrigger,
  findTriggerByIdempotencyKey,
  listLiveReadings,
} from "@/db/repositories/triggers";
import {
  listActiveVenues,
  listVenueIntegrations,
} from "@/db/repositories/venues";
import { isWithinBusinessHours, normalizeBusinessHours } from "@/domain/venues/activation";
import type { TriggerDecision } from "@/domain/triggers/types";
import { evaluateTrigger } from "@/domain/triggers/evaluate";
import type { BestTimeProvider } from "@/integrations/besttime/types";
import type { LiveReading } from "@/domain/venues/types";

const MAX_VENUES_PER_RUN = 25;

export type MonitorResult = {
  processed: number;
  candidates: number;
  suppressed: number;
  failures: number;
};

type VenueRow = {
  id: string;
  timezone?: string | null;
  businessHours?: Record<string, unknown> | null;
  dailyLimit?: number | null;
  weeklyLimit?: number | null;
  triggerDelta?: number | null;
  previousDelta?: number | null;
  /** Optional denormalized values are useful to callers with a policy view. */
  acceptedToday?: number;
  acceptedThisWeek?: number;
  hasPendingPromotion?: boolean;
  tenantId?: string | null;
  providerVenueId?: string | null;
};

export type MonitorVenuesInput = {
  db: DatabaseExecutor;
  provider: BestTimeProvider;
  runId?: string;
  idempotencyKey?: string;
  now?: Date;
  tenantId?: string;
  maxVenues?: number;
  candidateDispatcher?: (triggerId: string, venue: VenueRow) => Promise<void>;
  /** Resolve aggregate counts without exposing promotion rows to this service. */
  getAcceptedCounts?: (db: DatabaseExecutor, venue: VenueRow, now: Date) => Promise<{ today: number; week: number }>;
  hasPendingPromotion?: (db: DatabaseExecutor, venue: VenueRow, now: Date) => Promise<boolean>;
};

function jobKey(input: MonitorVenuesInput, now: Date): string {
  return input.idempotencyKey ?? `hourly:${input.runId ?? DateTime.fromJSDate(now).startOf("hour").toUTC().toISO()}`;
}

/** Stable per-venue/per-local-hour key; retries in another timezone produce the same UTC hour. */
export function buildTriggerIdempotencyKey(venueId: string, instant: Date, timezone = "Asia/Hong_Kong"): string {
  const localHour = DateTime.fromJSDate(instant, { zone: timezone }).startOf("hour");
  const hour = localHour.toUTC().toISO({ suppressMilliseconds: true });
  return `hourly:${venueId}:${hour}`;
}

function unavailableReading(now: Date, errorCode = "provider_error"): LiveReading {
  return { observedAt: now, forecastedBusyness: null, liveBusyness: null, delta: null, status: "unavailable", errorCode };
}

function storedResult(value: unknown): MonitorResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result = value as Record<string, unknown>;
  if (!["processed", "candidates", "suppressed", "failures"].every((key) => typeof result[key] === "number")) return undefined;
  return {
    processed: Number(result.processed),
    candidates: Number(result.candidates),
    suppressed: Number(result.suppressed),
    failures: Number(result.failures),
  };
}

/**
 * Fetch and persist one fresh BestTime reading for up to 25 active venues,
 * evaluate the pure policy, and dispatch only candidate triggers.
 */
export async function monitorVenues(input: MonitorVenuesInput): Promise<MonitorResult> {
  const now = input.now ?? new Date();
  const idempotencyKey = jobKey(input, now);
  const existing = await findJobRunByIdempotencyKey(input.db, idempotencyKey);
  const existingResult = storedResult(existing?.result);
  if (existingResult) return existingResult;
  const run = await claimJobRun(input.db, {
    kind: "monitor_venues",
    idempotencyKey,
    state: "running",
    attempts: (existing?.attempts ?? 0) + 1,
  });
  const result: MonitorResult = { processed: 0, candidates: 0, suppressed: 0, failures: 0 };
  try {
    const allVenues = (await listActiveVenues(input.db)) as unknown as VenueRow[];
    const venues = allVenues
      .filter((venue) => !input.tenantId || !venue.tenantId || venue.tenantId === input.tenantId)
      .slice(0, Math.min(input.maxVenues ?? MAX_VENUES_PER_RUN, MAX_VENUES_PER_RUN));

    for (const venue of venues) {
      result.processed += 1;
      try {
        const integrations = await listVenueIntegrations(input.db, venue.id);
        const bestTime = integrations.find((integration) => integration.provider === "besttime");
        const providerVenueId = venue.providerVenueId ?? bestTime?.externalId ?? undefined;
        const previous = (await listLiveReadings(input.db, venue.id, 2))[0];
        let reading: LiveReading;
        if (!providerVenueId) {
          reading = unavailableReading(now, "credentials_unavailable");
        } else {
          try {
            reading = await input.provider.getLive(providerVenueId);
          } catch (error) {
            reading = unavailableReading(now, error instanceof Error ? error.name : "provider_error");
          }
        }
        const observedAt = reading.observedAt instanceof Date && !Number.isNaN(reading.observedAt.getTime()) ? reading.observedAt : now;
        const persistedReading = await createLiveReading(input.db, {
          venueId: venue.id,
          observedAt,
          forecastedBusyness: reading.forecastedBusyness,
          liveBusyness: reading.liveBusyness,
          delta: reading.delta,
          status: reading.status,
          errorCode: reading.errorCode,
          providerRequestId: reading.providerRequestId,
        });
        const timezone = venue.timezone ?? "Asia/Hong_Kong";
        const businessHours = normalizeBusinessHours(venue.businessHours ?? {});
        const insideBusinessHours = isWithinBusinessHours(observedAt, timezone, businessHours);
        const counts = input.getAcceptedCounts
          ? await input.getAcceptedCounts(input.db, venue, now)
          : { today: venue.acceptedToday ?? 0, week: venue.acceptedThisWeek ?? 0 };
        const hasPending = input.hasPendingPromotion
          ? await input.hasPendingPromotion(input.db, venue, now)
          : Boolean(venue.hasPendingPromotion);
        const decision: TriggerDecision = evaluateTrigger({
          active: true,
          insideBusinessHours,
          currentDelta: reading.delta,
          previousDelta: previous?.delta,
          hasPendingPromotion: hasPending,
          acceptedToday: counts.today,
          acceptedThisWeek: counts.week,
          dailyLimit: venue.dailyLimit ?? 1,
          weeklyLimit: venue.weeklyLimit ?? 3,
          threshold: venue.triggerDelta ?? undefined,
          previousThreshold: venue.previousDelta ?? undefined,
          currentReading: { observedAt, status: reading.status, delta: reading.delta },
          // The preceding scheduled reading is intentionally not age-checked:
          // hourly scans naturally observe it roughly one hour in the past.
          currentFresh: reading.status === "ok",
          now,
        });
        const triggerKey = buildTriggerIdempotencyKey(venue.id, now, timezone);
        const existingTrigger = await findTriggerByIdempotencyKey(input.db, triggerKey);
        const trigger = existingTrigger ?? (await createTrigger(input.db, {
          venueId: venue.id,
          liveReadingId: persistedReading?.id,
          idempotencyKey: triggerKey,
          decision: decision.decision,
          reason: decision.reason,
        }));
        if (!trigger) throw new Error(`trigger ${triggerKey} was not persisted`);
        await appendAuditEvent(input.db, {
          actorType: "system",
          action: "trigger_evaluated",
          objectType: "trigger",
          objectId: trigger.id,
          metadata: { venueId: venue.id, decision: decision.decision, reason: decision.reason, idempotencyKey: triggerKey },
        });
        if (decision.decision === "candidate") {
          result.candidates += 1;
          if (input.candidateDispatcher && !existingTrigger) await input.candidateDispatcher(trigger.id, venue);
        } else {
          result.suppressed += 1;
        }
      } catch {
        result.failures += 1;
      }
    }
    if (run?.id) await updateJobRun(input.db, run.id, { state: "completed", result, completedAt: now });
    return result;
  } catch (error) {
    if (run?.id) await updateJobRun(input.db, run.id, { state: "failed", result, completedAt: now });
    throw error;
  }
}

