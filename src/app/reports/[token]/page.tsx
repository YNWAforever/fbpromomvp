import { withDatabase } from "@/db/client";
import { getWeeklyReport } from "@/db/repositories/reports";
import { getVenue } from "@/db/repositories/venues";
import { env } from "@/env";
import { verifyScopedToken } from "@/lib/security/signed-token";
import DeltaChart, { type ChartPoint, weeklyMetricItems } from "@/components/reports/delta-chart";

function InvalidReport() { return <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6"><section className="rounded-2xl border bg-white p-6"><h1 className="text-xl font-semibold">Report unavailable</h1><p className="mt-2 text-slate-600">This report link is invalid, expired, or no longer available.</p></section></main>; }
function chartPoints(value: unknown): ChartPoint[] { return Array.isArray(value) ? value.filter((point): point is ChartPoint => Boolean(point && typeof point === "object" && typeof (point as ChartPoint).at === "string" && typeof (point as ChartPoint).delta === "number")) : []; }

export default async function WeeklyReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const scoped = verifyScopedToken(token, env.OWNER_LINK_SECRET, "weekly-report");
  if (!scoped) return <InvalidReport />;
  const data = await withDatabase(async (db) => { const report = await getWeeklyReport(db, scoped.subject); if (!report) return null; const venue = await getVenue(db, report.venueId); return venue ? { report, venue } : null; });
  if (!data) return <InvalidReport />;
  const metrics = data.report.metrics as Record<string, unknown>; const points = chartPoints(data.report.chartPoints);
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><article className="mx-auto max-w-4xl space-y-6 rounded-3xl bg-white p-6 shadow-sm sm:p-10">
    <header><p className="text-sm font-medium text-teal-700">Quiet-period performance</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">{data.venue.name}</h1><p className="mt-2 text-sm text-slate-500">{data.report.periodStart.toLocaleDateString("en-HK")} – {data.report.periodEnd.toLocaleDateString("en-HK")}</p></header>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">{weeklyMetricItems(metrics).map((item) => <div key={item.label} className="rounded-xl bg-slate-100 p-4"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{item.value}</p></div>)}</section>
    <section><h2 className="mb-3 text-lg font-semibold">Quiet-period delta trend</h2><DeltaChart points={points} /></section>
  </article></main>;
}