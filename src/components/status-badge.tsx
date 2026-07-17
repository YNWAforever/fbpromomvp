const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  approval_expired: "Approval expired",
  approval_pending: "Approval pending",
  approved: "Approved",
  blocked: "Blocked coverage",
  blocked_coverage: "Blocked coverage",
  cancelled: "Cancelled",
  edited: "Edited",
  expired: "Approval expired",
  incomplete: "Report incomplete",
  needs_match_review: "Needs match review",
  pending: "Approval pending",
  provider_error: "Provider unavailable",
  provider_unavailable: "Provider unavailable",
  queued: "Queued",
  report_incomplete: "Report incomplete",
  selected: "Selected",
  send_failed: "Send failed",
  sending: "Sending",
  skipped: "Skipped",
};

function titleCaseStatus(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function statusLabel(status: string, reason?: string): string {
  const normalizedReason = reason?.toLowerCase() ?? "";
  if (status === "needs_match_review" || normalizedReason.includes("match") || normalizedReason.includes("mismatch")) {
    return "Needs match review";
  }
  return STATUS_LABELS[status] ?? titleCaseStatus(status);
}

export default function StatusBadge({ status, reason }: { status: string; reason?: string }) {
  const label = statusLabel(status, reason);
  const tone = label === "Needs match review" || label === "Blocked coverage" || label === "Provider unavailable" || label === "Send failed"
    ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
    : label === "Active" || label === "Approved"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
      : "border-slate-700 bg-slate-800/80 text-slate-200";

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}
