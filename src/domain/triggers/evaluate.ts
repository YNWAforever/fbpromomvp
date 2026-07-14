import { isLiveReadingFresh, isWithinBusinessHours } from "@/domain/venues/activation";
import type { TriggerDecision, TriggerEvaluationInput } from "./types";

const DEFAULT_THRESHOLD = -20;
const DEFAULT_PREVIOUS_THRESHOLD = -15;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function skip(reason: TriggerDecision["reason"]): TriggerDecision {
  return { decision: "skip", reason };
}

/**
 * Ordered, side-effect-free trigger policy. Persistence and dispatch belong in
 * the monitor application service; keeping this function pure makes the
 * policy deterministic when the provider or database is unavailable.
 */
export function evaluateTrigger(input: TriggerEvaluationInput): TriggerDecision {
  if (!input.active) return skip("inactive");

  // The monitor normally supplies this precomputed flag. When a timestamp and
  // normalized hours are supplied, re-check it here so direct callers cannot
  // accidentally bypass the venue-local window.
  if (input.insideBusinessHours === false) return skip("outside_business_hours");
  if (input.timezone && input.businessHours && input.currentReading) {
    const inside = isWithinBusinessHours(input.currentReading.observedAt, input.timezone, input.businessHours);
    if (!inside) return skip("outside_business_hours");
  }

  const currentDelta = input.currentDelta;
  const previousDelta = input.previousDelta;
  if (currentDelta === null || currentDelta === undefined || previousDelta === null || previousDelta === undefined) {
    return skip("missing_data");
  }

  const now = input.now ?? new Date();
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (input.currentFresh === false || input.previousFresh === false) return skip("stale_data");
  if (input.currentReading && !isLiveReadingFresh(input.currentReading, now, maxAgeMs)) return skip("stale_data");
  if (input.previousReading && !isLiveReadingFresh(input.previousReading, now, maxAgeMs)) return skip("stale_data");

  if (!Number.isFinite(currentDelta) || !Number.isFinite(previousDelta)) return skip("missing_data");
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const previousThreshold = input.previousThreshold ?? DEFAULT_PREVIOUS_THRESHOLD;
  if (currentDelta > threshold) return skip("threshold");
  if (previousDelta > previousThreshold) return skip("debounce");
  if (input.hasPendingPromotion) return skip("pending_promotion");
  if (input.acceptedToday >= input.dailyLimit) return skip("daily_limit");
  if (input.acceptedThisWeek >= input.weeklyLimit) return skip("weekly_limit");
  if (input.manualReview) return { decision: "manual_review", reason: "manual_review" };

  return { decision: "candidate", reason: "sustained_quiet" };
}

export const evaluate = evaluateTrigger;

