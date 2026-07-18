import Link from "next/link";
import EmptyState from "@/components/empty-state";
import MetricCard from "@/components/metric-card";
import StatusBadge from "@/components/status-badge";
import { withDatabase } from "@/db/client";
import { listAuditEvents } from "@/db/repositories/audit";
import { listPromotions } from "@/db/repositories/promotions";
import { findApprovalByTriggerId, listCopyCandidates, listLiveReadings, listTriggersForVenue } from "@/db/repositories/triggers";
import { getLatestForecastSnapshot, getVenue, listActiveOfferTemplates, listVenueIntegrations } from "@/db/repositories/venues";
import { listWeeklyReports } from "@/db/repositories/reports";
import { requireStaff } from "@/lib/auth/require-staff";

function reportMetric(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === "number" ? String(value) : "Unavailable";
}

export default async function VenueDetailPage({ params }: { params: Promise<{ venueId: string }> }) {
  await requireStaff();
  const { venueId } = await params;
  const data = await withDatabase(async (db) => {
    const venue = await getVenue(db, venueId);
    if (!venue) return null;
    const [integrations, templates, forecast, readings, triggers, reports, promotions, audits] = await Promise.all([
      listVenueIntegrations(db, venueId),
      listActiveOfferTemplates(db, venueId),
      getLatestForecastSnapshot(db, venueId),
      listLiveReadings(db, venueId, 12),
      listTriggersForVenue(db, venueId),
      listWeeklyReports(db, 100),
      listPromotions(db, 100),
      listAuditEvents(db, "venue", venueId),
    ]);
    const triggerContext = await Promise.all(triggers.map(async (trigger) => {
      const [candidates, approval] = await Promise.all([
        listCopyCandidates(db, trigger.id),
        findApprovalByTriggerId(db, trigger.id, venueId),
      ]);
      return { trigger, candidates: candidates ?? [], approval };
    }));
    return {
      venue,
      integrations,
      templates,
      forecast,
      readings,
      triggerContext,
      reports: reports.filter((report) => report.venueId === venueId),
      promotions: promotions.filter((promotion) => promotion.venueId === venueId),
      audits,
      forecastExpired: forecast ? forecast.expiresAt.getTime() <= new Date().getTime() : false,
    };
  });

  if (!data) {
    return <EmptyState title="Venue unavailable" description="This venue does not exist or is no longer available." action={{ label: "Back to venues", href: "/dashboard/venues" }} />;
  }

  const candidateCount = data.triggerContext.reduce((total, item) => total + item.candidates.length, 0);
  return (
    <div>
      <Link className="text-sm text-cyan-300 hover:underline" href="/dashboard/venues">Back to venues</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-cyan-300">Venue detail</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{data.venue.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{data.venue.address} · {data.venue.timezone}</p>
        </div>
        <StatusBadge status={data.venue.status} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Readings" value={data.readings.length} />
        <MetricCard label="Triggers" value={data.triggerContext.length} />
        <MetricCard label="Copy candidates" value={candidateCount} />
        <MetricCard label="Promotions" value={data.promotions.length} />
        <MetricCard label="Weekly reports" value={data.reports.length} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold text-white">Configuration</h2>
          <p className="mt-3 text-sm text-slate-400">Integrations: {data.integrations.length}</p>
          <p className="mt-2 text-sm text-slate-400">Offer templates: {data.templates.length}</p>
          <p className="mt-2 text-sm text-slate-400">Forecast: {data.forecast ? "Available" : "Unavailable"}</p>
          {data.forecast && <p className="mt-2 text-xs text-slate-500">Freshness: fetched {data.forecast.fetchedAt.toLocaleString("en-HK")} · expires {data.forecast.expiresAt.toLocaleString("en-HK")} · {data.forecastExpired ? "Expired" : "Current"}</p>}
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold text-white">Audit history</h2>
          {data.audits.length === 0 ? <p className="mt-3 text-sm text-slate-400">No audit events</p> : <div className="mt-3 space-y-2">{data.audits.slice(0, 8).map((audit) => <p key={audit.id} className="text-sm text-slate-400">{audit.createdAt.toLocaleString("en-HK")} · {audit.action} · {audit.actorType}</p>)}</div>}
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Recent readings</h2>
        {data.readings.length === 0 ? <p className="mt-3 text-sm text-slate-400">No live readings yet.</p> : <div className="mt-4 space-y-3">{data.readings.slice(0, 8).map((reading) => <div key={reading.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-4"><div><p className="text-sm text-slate-200">{reading.observedAt.toLocaleString("en-HK")}</p><p className="mt-1 text-xs text-slate-500">Live {reading.liveBusyness ?? "Unavailable"} · Forecast {reading.forecastedBusyness ?? "Unavailable"} · Delta {reading.delta ?? "Unavailable"}</p></div><StatusBadge status={reading.status} /></div>)}</div>}
      </section>

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Trigger and approval review</h2>
        {data.triggerContext.length === 0 ? <p className="mt-3 text-sm text-slate-400">No trigger readings or approval candidates yet.</p> : <div className="mt-4 space-y-3">{data.triggerContext.map(({ trigger, candidates, approval }) => <div key={trigger.id} className="rounded-lg border border-slate-800 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-300">{trigger.reason}</span><StatusBadge status={trigger.decision} /></div><p className="mt-2 text-xs text-slate-400">{candidates.length} copy candidates · {approval ? `Approval ${approval.state}` : "No approval"}</p></div>)}</div>}
      </section>

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Promotions</h2>
        {data.promotions.length === 0 ? <p className="mt-3 text-sm text-slate-400">No promotions for this venue.</p> : <div className="mt-4 space-y-3">{data.promotions.map((promotion) => <Link key={promotion.id} href={`/dashboard/promotions/${promotion.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-4 hover:border-cyan-300/50"><span className="text-sm text-slate-200">{promotion.campaignCode}</span><StatusBadge status={promotion.state} /></Link>)}</div>}
      </section>

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="font-semibold text-white">Weekly reports</h2>
        {data.reports.length === 0 ? <p className="mt-3 text-sm text-slate-400">No weekly reports for this venue.</p> : <div className="mt-4 space-y-2">{data.reports.slice(0, 6).map((report) => <p key={report.id} className="text-sm text-slate-400">{report.periodStart.toLocaleDateString("en-HK")} to {report.periodEnd.toLocaleDateString("en-HK")} · Checks {reportMetric(report.metrics, "checks")} · Redemptions {reportMetric(report.metrics, "redeemedCount")} · {report.state}</p>)}</div>}
      </section>
    </div>
  );
}