import { ImageResponse } from "next/og";
import { withDatabase } from "@/db/client";
import { getWeeklyReport } from "@/db/repositories/reports";
import { getVenue } from "@/db/repositories/venues";
import { env } from "@/env";
import { verifyScopedToken } from "@/lib/security/signed-token";
import DeltaChart, { type ChartPoint, weeklyMetricItems } from "@/components/reports/delta-chart";

function chartPoints(value: unknown): ChartPoint[] { return Array.isArray(value) ? value.filter((point): point is ChartPoint => Boolean(point && typeof point === "object" && typeof (point as ChartPoint).at === "string" && typeof (point as ChartPoint).delta === "number")) : []; }
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const scoped = verifyScopedToken(token, env.OWNER_LINK_SECRET, "weekly-report");
  if (!scoped) return new Response("Report unavailable", { status: 404 });
  const data = await withDatabase(async (db) => { const report = await getWeeklyReport(db, scoped.subject); if (!report) return null; const venue = await getVenue(db, report.venueId); return venue ? { report, venue } : null; });
  if (!data) return new Response("Report unavailable", { status: 404 });
  const items = weeklyMetricItems(data.report.metrics as Record<string, unknown>); const points = chartPoints(data.report.chartPoints);
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 48, background: "#f8fafc", color: "#0f172a" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}><div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 22, color: "#0f766e" }}>Quiet-period performance</span><span style={{ fontSize: 44, fontWeight: 700 }}>{data.venue.name}</span></div><span style={{ fontSize: 20, color: "#64748b" }}>{data.report.periodStart.toISOString().slice(0, 10)} – {data.report.periodEnd.toISOString().slice(0, 10)}</span></div>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>{items.map((item) => <div key={item.label} style={{ width: 200, display: "flex", flexDirection: "column", padding: 14, borderRadius: 12, background: "white" }}><span style={{ fontSize: 14, color: "#64748b" }}>{item.label}</span><span style={{ fontSize: 25, fontWeight: 700 }}>{item.value}</span></div>)}</div>
    <div style={{ display: "flex", marginTop: 24 }}><DeltaChart points={points} width={1100} height={180} /></div>
  </div>, { width: 1200, height: 630 });
}