export type WeeklyReading = { observedAt: string | Date; delta: number | null };
export type WeeklyTrigger = { decision: string; delta?: number | null };
export type WeeklyApproval = { state: string };
export type WeeklyPromotion = { state?: string; sentCount: number | null };
export type WeeklyRedemption = { count: number };

export type WeeklyReportInput = {
  readings: WeeklyReading[];
  triggers: WeeklyTrigger[];
  approvals?: WeeklyApproval[];
  promotions: WeeklyPromotion[];
  redemptions: WeeklyRedemption[];
  averageOrderValue?: number | null;
};

export type WeeklyReportMetrics = {
  checks: number;
  triggers: number;
  approvals: number;
  skips: number;
  timeouts: number;
  acceptedBroadcasts: number;
  sentCount: number | null;
  redeemedCount: number;
  redemptionRate: number | null;
  revenue: number | null;
  averageTriggerDelta: number | null;
  chartPoints: Array<{ at: string; delta: number }>;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function aggregateWeeklyReport(input: WeeklyReportInput): WeeklyReportMetrics {
  const approvals = input.approvals ?? [];
  const sentCount = input.promotions.some((promotion) => promotion.sentCount === null || !finite(promotion.sentCount))
    ? null
    : input.promotions.reduce((sum, promotion) => sum + Number(promotion.sentCount), 0);
  const redeemedCount = input.redemptions.reduce((sum, redemption) => sum + (finite(redemption.count) ? redemption.count : 0), 0);
  const deltas = input.triggers.filter((trigger) => trigger.decision === "candidate").map((trigger) => trigger.delta).filter(finite);
  const chartPoints = input.readings
    .filter((reading): reading is WeeklyReading & { delta: number } => finite(reading.delta) && Number.isFinite(new Date(reading.observedAt).getTime()))
    .map((reading) => ({ at: typeof reading.observedAt === "string" ? reading.observedAt : reading.observedAt.toISOString(), delta: reading.delta }))
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  const averageTriggerDelta = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null;
  const redemptionRate = sentCount !== null && sentCount > 0 ? redeemedCount / sentCount : null;
  const revenue = finite(input.averageOrderValue) ? redeemedCount * input.averageOrderValue : null;
  return {
    checks: input.readings.length,
    triggers: input.triggers.filter((trigger) => trigger.decision === "candidate").length,
    approvals: approvals.filter((approval) => approval.state === "approved").length,
    skips: approvals.filter((approval) => approval.state === "skipped").length,
    timeouts: approvals.filter((approval) => approval.state === "expired").length,
    acceptedBroadcasts: input.promotions.filter((promotion) => promotion.state === "accepted").length,
    sentCount,
    redeemedCount,
    redemptionRate,
    revenue,
    averageTriggerDelta,
    chartPoints,
  };
}