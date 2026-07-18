import Link from "next/link";
import EmptyState from "@/components/empty-state";
import MetricCard from "@/components/metric-card";
import StatusBadge from "@/components/status-badge";
import { withDatabase } from "@/db/client";
import { listAuditEvents } from "@/db/repositories/audit";
import { getPromotion } from "@/db/repositories/promotions";
import { getRedemptionReport } from "@/db/repositories/reports";
import { getApproval, listCopyCandidates } from "@/db/repositories/triggers";
import { requireStaff } from "@/lib/auth/require-staff";

export default async function PromotionDetailPage({ params }: { params: Promise<{ promotionId: string }> }) {
  await requireStaff();
  const { promotionId } = await params;
  const data = await withDatabase(async (db) => {
    const promotion = await getPromotion(db, promotionId);
    if (!promotion) return null;
    const [approval, redemption, audits] = await Promise.all([
      getApproval(db, promotion.approvalId),
      getRedemptionReport(db, promotion.id),
      listAuditEvents(db, "promotion", promotion.id),
    ]);
    const candidates = approval ? await listCopyCandidates(db, approval.triggerId) : [];
    return { promotion, approval, candidates: candidates ?? [], redemption, audits };
  });

  if (!data) {
    return <EmptyState title="Promotion unavailable" description="This promotion does not exist or is no longer available." action={{ label: "Back to promotions", href: "/dashboard/promotions" }} />;
  }

  const { promotion, approval } = data;
  return (
    <div>
      <Link className="text-sm text-cyan-300 hover:underline" href="/dashboard/promotions">Back to promotions</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-cyan-300">Promotion detail</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{promotion.campaignCode}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{promotion.body}</p>
        </div>
        <StatusBadge status={promotion.state} />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Audience" value={promotion.memberCount} />
        <MetricCard label="Sent" value={promotion.sentCount} />
        <MetricCard label="Redemptions" value={data.redemption?.count} />
        <MetricCard label="Copy candidates" value={data.candidates.length} />
        <MetricCard label="Audit events" value={data.audits.length} />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold text-white">Approval and copy</h2>
          <p className="mt-3 text-sm text-slate-400">{approval ? `Approval ${approval.state}` : "Approval unavailable"}</p>
          {approval && <p className="mt-2 text-xs text-slate-500">Created {approval.createdAt.toLocaleString("en-HK")} · Expires {approval.expiresAt.toLocaleString("en-HK")} · Resolved {approval.resolvedAt?.toLocaleString("en-HK") ?? "Unavailable"}</p>}
          {approval?.providerMessageId && <p className="mt-2 text-xs text-slate-500">Provider approval message recorded</p>}
          {data.candidates.length === 0 ? <p className="mt-4 text-sm text-slate-400">No copy candidates</p> : <div className="mt-4 space-y-3">{data.candidates.map((candidate) => <article key={candidate.id} className={`rounded-lg border p-4 ${candidate.id === approval?.selectedCandidateId ? "border-cyan-300/70" : "border-slate-800"}`}><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs uppercase tracking-wide text-slate-500">{candidate.provider} · {candidate.source}</span>{candidate.id === approval?.selectedCandidateId && <span className="text-xs font-semibold text-cyan-200">Selected copy</span>}</div><p className="mt-2 text-sm text-slate-200">{candidate.body}</p><p className="mt-2 text-xs text-slate-500">{candidate.valid ? "Valid" : `Invalid: ${(candidate.validationErrors ?? []).join(", ") || "review required"}`}</p></article>)}</div>}
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold text-white">Delivery window</h2>
          <p className="mt-3 text-sm text-slate-400">{promotion.validFrom.toLocaleString("en-HK")} to {promotion.validUntil.toLocaleString("en-HK")}</p>
          <p className="mt-2 text-sm text-slate-400">Broadcast: {promotion.providerBroadcastId ?? "Unavailable"}</p>
          <p className="mt-2 text-sm text-slate-400">Attempts: {promotion.attempts}</p>
          <p className="mt-2 text-sm text-slate-400">Members: {promotion.memberCount ?? "Unavailable"} · Sent: {promotion.sentCount ?? "Unavailable"}</p>
          {promotion.providerReceipt && <p className="mt-2 text-xs text-slate-500">Provider receipt recorded</p>}
        </section>
      </div>
      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Redemption report</h2>
        <p className="mt-3 text-sm text-slate-400">{data.redemption ? `${data.redemption.count} redeemed` : "No redemption report"}</p>
        {data.redemption?.note && <p className="mt-2 text-sm text-slate-500">{data.redemption.note}</p>}
      </section>
      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Audit history</h2>
        {data.audits.length === 0 ? <p className="mt-3 text-sm text-slate-400">No audit events</p> : <div className="mt-3 space-y-2">{data.audits.slice(0, 8).map((audit) => <p key={audit.id} className="text-sm text-slate-400">{audit.createdAt.toLocaleString("en-HK")} · {audit.action} · {audit.actorType}</p>)}</div>}
      </section>
    </div>
  );
}