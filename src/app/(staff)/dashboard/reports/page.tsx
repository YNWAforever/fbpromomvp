import EmptyState from "@/components/empty-state";
import MetricCard from "@/components/metric-card";
import StatusBadge from "@/components/status-badge";
import { withDatabase } from "@/db/client";
import { listWeeklyReports } from "@/db/repositories/reports";
import { requireStaff } from "@/lib/auth/require-staff";

export default async function ReportsPage() {
  await requireStaff();
  const reports = await withDatabase((db) => listWeeklyReports(db));
  return (
    <div>
      <p className="text-sm font-medium text-cyan-300">Reports</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Weekly performance</h1>
      <div className="mt-8">{reports.length === 0 ? <EmptyState title="No reports" description="Weekly quiet-period reports will appear after the first reporting run." /> : <div className="space-y-3">{reports.map((report) => { const metrics = report.metrics as Record<string, unknown>; return <article key={report.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5"><div><h2 className="font-semibold text-white">{report.periodStart.toLocaleDateString("en-HK") + " to " + report.periodEnd.toLocaleDateString("en-HK")}</h2><p className="mt-1 text-sm text-slate-400">Venue {report.venueId}</p></div><div className="flex items-center gap-4"><MetricCard label="Redemptions" value={typeof metrics.redeemedCount === "number" ? metrics.redeemedCount : null} /><StatusBadge status={report.state} /></div></article> })}</div>}</div>
    </div>
  );
}