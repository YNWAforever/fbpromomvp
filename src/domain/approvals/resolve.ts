export type ApprovalState = "pending" | "selected" | "edited" | "approved" | "skipped" | "expired" | "send_failed";
export type ApprovalAction = "select" | "edit" | "approve" | "skip";
export type ApprovalResolution = { next: ApprovalState | "unchanged"; reason?: "expired" | "invalid_transition" };

/** Pure approval state machine. Expiry is checked before every owner action. */
export function resolveApproval(input: { state: ApprovalState | string; now: Date; expiresAt: Date; action: ApprovalAction }): ApprovalResolution {
  if (input.state !== "pending" && input.state !== "selected" && input.state !== "edited") return { next: "unchanged" };
  if (input.now.getTime() >= input.expiresAt.getTime()) return { next: "expired" };
  if (input.action === "select") return { next: "selected" };
  if (input.action === "edit") return { next: "edited" };
  if (input.action === "approve") return { next: "approved" };
  if (input.action === "skip") return { next: "skipped" };
  return { next: "unchanged", reason: "invalid_transition" };
}

export function isApprovalTerminal(state: string): boolean {
  return state === "approved" || state === "skipped" || state === "expired";
}

