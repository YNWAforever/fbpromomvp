import { DateTime } from "luxon";
import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent } from "@/db/repositories/audit";
import { claimJobRun, findJobRunByIdempotencyKey, updateJobRun } from "@/db/repositories/jobs";
import {
  createLiveReading,
  createTrigger,
  createTriggerWithStatus,
  findTriggerByIdempotencyKey,
  listLiveReadings,
} from "@/db/repositories/triggers";
import { listActiveVenues, listVenueIntegrations } from "@/db/repositories/venues";
import { isWithinBusinessHours, normalizeBusinessHours } from "@/domain/venues/activation";
import type { TriggerDecision } from "@/domain/triggers/types";
import { evaluateTrigger } from "@/domain/triggers/evaluate";
import type { BestTimeProvider } from "@/integrations/besttime/types";
import type { LiveReading } from "@/domain/venues/types";

const MAX_VENUES_PER_RUN = 25;
const PREVIOUS_MAX_AGE_MS = 90 * 60 * 1000;
const PREVIOUS_MIN_GAP_MS = 45 * 60 * 1000;
const PREVIOUS_MAX_GAP_MS = 90 * 60 * 1000;

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
  approvalTimeoutMinutes?: number | null;
  triggerDelta?: number | null;
  previousDelta?: number | null;
  /** Optional denormalized values are retained only for non-route callers/tests. */
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

export class JobInProgressError extends Error {
  readonly code = "JOB_IN_PROGRESS" as const;

  constructor(idempotencyKey: string) {
    super(`job ${idempotencyKey} is already running`);
    this.name = "JobInProgressError";
  }
}

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

function isAdjacentPreviousReading(previous: Pick<LiveReading, "observedAt" | "status" | "delta"> | undefined, current: Date) {
  if (!previous || previous.status !== "ok" || previous.delta === null) return false;
  const observedAt = previous.observedAt instanceof Date ? previous.observedAt.getTime() : Number.NaN;
  const gap = current.getTime() - observedAt;
  return Number.isFinite(gap) && gap >= PREVIOUS_MIN_GAP_MS && gap <= PREVIOUS_MAX_GAP_MS;
}

/**
 * Fetch and persist one fresh BestTime reading for up to 25 active venues,
 * evaluate the pure policy, and dispatch only candidate triggers.
 */
export async function monitorVenues(input: MonitorVenuesInput): Promise<MonitorResult> {
  if (!input.candidateDispatcher) throw new Error("candidate dispatcher is required");

  const now = input.now ?? new Date();
  const idempotencyKey = jobKey(input, now);
  const existing = await findJobRunByIdempotencyKey(input.db, idempotencyKey);
  const existingResult = storedResult(existing?.result);
  if (existing?.state === "completed" && existingResult) return existingResult;

  const claimed = await claimJobRun(input.db, {
    kind: "monitor_venues",
    idempotencyKey,
    state: "running",
    attempts: (existing?.attempts ?? 0) + 1,
  });
  const run = "run" in (claimed as object) ? claimed.run : (claimed as typeof claimed & { id?: string });
  const ownsRun = "claimed" in (claimed as object) ? claimed.claimed : true;
  if (!ownsRun) throw new JobInProgressError(idempotencyKey);
  if (!run?.id) throw new Error(`job ${idempotencyKey} was not persisted`);

  const result: MonitorResult = { processed: 0, candidates: 0, suppressed: 0, failures: 0 };
  try {
    const maxVenues = Math.min(input.maxVenues ?? MAX_VENUES_PER_RUN, MAX_VENUES_PER_RUN);
    const allVenues = (await listActiveVenues(input.db, maxVenues)) as unknown as VenueRow[];
    const venues = allVenues
      .filter((venue) => !input.tenantId || !venue.tenantId || venue.tenantId === input.tenantId)
      .slice(0, maxVenues);

    for (const venue of venues) {
      result.processed += 1;
      try {
        const integrations = await listVenueIntegrations(input.db, venue.id);
        const bestTime = integrations.find((integration) => integration.provider === "besttime");
        const providerVenueId = venue.providerVenueId ?? bestTime?.externalId ?? undefined;
        const previous = (await listLiveReadings(input.db, venue.id, 2))[0] as LiveReading | undefined;
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
        const previousFresh = isAdjacentPreviousReading(previous, observedAt);
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
          previousReading: previous ? { observedAt: previous.observedAt, status: previous.status, delta: previous.delta } : undefined,
          previousFresh,
          previousMaxAgeMs: PREVIOUS_MAX_AGE_MS,
          currentFresh: reading.status === "ok",
          now,
        });
        const triggerKey = buildTriggerIdempotencyKey(venue.id, now, timezone);
        const existingTrigger = await findTriggerByIdempotencyKey(input.db, triggerKey);
        const triggerResult = existingTrigger
          ? { trigger: existingTrigger, created: false }
          : typeof createTriggerWithStatus === "function"
            ? await createTriggerWithStatus(input.db, {
                venueId: venue.id,
                liveReadingId: persistedReading?.id,
                idempotencyKey: triggerKey,
                decision: decision.decision,
                reason: decision.reason,
              })
            : {
                trigger: await createTrigger(input.db, {
                  venueId: venue.id,
                  liveReadingId: persistedReading?.id,
                  idempotencyKey: triggerKey,
                  decision: decision.decision,
                  reason: decision.reason,
                }),
                created: true,
              };
        const trigger = triggerResult.trigger;
        if (!trigger) throw new Error(`trigger ${triggerKey} was not persisted`);
        if (triggerResult.created) {
          await appendAuditEvent(input.db, {
            actorType: "system",
            action: "trigger_evaluated",
            objectType: "trigger",
            objectId: trigger.id,
            idempotencyKey: `${triggerKey}:trigger_evaluated`,
            metadata: { venueId: venue.id, decision: decision.decision, reason: decision.reason, idempotencyKey: triggerKey },
          });
        }
        if (decision.decision === "candidate") {
          if (triggerResult.created) {
            await input.candidateDispatcher(trigger.id, venue);
          }
          result.candidates += 1;
        } else {
          result.suppressed += 1;
        }
      } catch {
        result.failures += 1;
      }
    }
    await updateJobRun(input.db, run.id, { state: "completed", result, completedAt: now });
    return result;
  } catch (error) {
    await updateJobRun(input.db, run.id, { state: "failed", result, completedAt: now });
    throw error;
  }
}
