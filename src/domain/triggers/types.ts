import type { LiveReading, NormalizedBusinessHours } from "@/domain/venues/types";

/** Reasons are persisted with every hourly reading, including suppressed runs. */
export type TriggerReason =
  | "inactive"
  | "outside_business_hours"
  | "missing_data"
  | "stale_data"
  | "threshold"
  | "debounce"
  | "pending_promotion"
  | "daily_limit"
  | "weekly_limit"
  | "manual_review"
  | "sustained_quiet";

export type TriggerDecisionKind = "candidate" | "skip" | "manual_review" | "offered";

export type TriggerDecision = {
  decision: TriggerDecisionKind;
  reason: TriggerReason;
};

export type TriggerEvaluationInput = {
  active: boolean;
  insideBusinessHours: boolean;
  currentDelta: number | null | undefined;
  previousDelta: number | null | undefined;
  hasPendingPromotion: boolean;
  acceptedToday: number;
  acceptedThisWeek: number;
  dailyLimit: number;
  weeklyLimit: number;
  /** Override the initial -20% current reading threshold. */
  threshold?: number;
  /** Override the initial -15% preceding reading debounce threshold. */
  previousThreshold?: number;
  /** Optional readings allow the evaluator to enforce freshness itself. */
  currentReading?: Pick<LiveReading, "observedAt" | "status" | "delta"> | null;
  previousReading?: Pick<LiveReading, "observedAt" | "status" | "delta"> | null;
  now?: Date;
  maxAgeMs?: number;
  /** Optional precomputed flags are useful when the caller owns a clock/timezone. */
  currentFresh?: boolean;
  previousFresh?: boolean;
  /** A venue with a pending identity/configuration review cannot be offered automatically. */
  manualReview?: boolean;
  timezone?: string;
  businessHours?: NormalizedBusinessHours;
};

