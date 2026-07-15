export type PromotionState = "queued" | "sending" | "accepted" | "send_failed" | "cancelled";
export type PromotionEvent = "send" | "accepted" | "failed" | "cancel";

export function transitionPromotion(input: { state: PromotionState | string; event: PromotionEvent }): { next: PromotionState | "unchanged"; reason?: string } {
  if (input.state === "queued" && input.event === "send") return { next: "sending" };
  if (input.state === "sending" && input.event === "accepted") return { next: "accepted" };
  if (input.state === "sending" && input.event === "failed") return { next: "send_failed" };
  if ((input.state === "queued" || input.state === "send_failed") && input.event === "cancel") return { next: "cancelled" };
  return { next: "unchanged", reason: "invalid_transition" };
}

export function canRetryPromotion(state: string, attempts: number): boolean {
  return state === "send_failed" && Number.isInteger(attempts) && attempts >= 0 && attempts < 3;
}

export function countsTowardLimits(state: string): boolean {
  return state === "accepted";
}
