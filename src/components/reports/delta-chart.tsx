export type ChartPoint = { at: string; delta: number };

export function weeklyMetricItems(metrics: Record<string, unknown>) {
  const number = (key: string) => typeof metrics[key] === "number" && Number.isFinite(metrics[key]) ? metrics[key] as number : null;
  const count = (key: string) => number(key) === null ? "Unavailable" : String(number(key));
  return [
    { label: "Checks", value: count("checks") },
    { label: "Triggers", value: count("triggers") },
    { label: "Approvals", value: count("approvals") },
    { label: "Skips", value: count("skips") },
    { label: "Timeouts", value: count("timeouts") },
    { label: "Accepted broadcasts", value: count("acceptedBroadcasts") },
    { label: "Sent", value: number("sentCount") === null ? "Unavailable" : String(number("sentCount")) },
    { label: "Redemptions", value: count("redeemedCount") },
    { label: "Redemption rate", value: number("redemptionRate") === null ? "Unavailable" : `${(number("redemptionRate")! * 100).toFixed(1)}%` },
    { label: "Revenue", value: number("revenue") === null ? "Unavailable" : number("revenue")!.toLocaleString("en-HK", { style: "currency", currency: "HKD", maximumFractionDigits: 0 }) },
    { label: "Average trigger delta", value: number("averageTriggerDelta") === null ? "Unavailable" : number("averageTriggerDelta")!.toFixed(1) },
  ];
}

function polyline(points: ChartPoint[], width: number, height: number): string {
  if (!points.length) return "";
  const values = points.map((point) => point.delta);
  const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(1, max - min);
  return points.map((point, index) => `${points.length === 1 ? width / 2 : (index / (points.length - 1)) * width},${height - ((point.delta - min) / span) * height}`).join(" ");
}

export default function DeltaChart({ points, width = 720, height = 220 }: { points: ChartPoint[]; width?: number; height?: number }) {
  const path = polyline(points, width, height);
  return <svg role="img" aria-label="Quiet-period delta trend" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ background: "#f8fafc", borderRadius: 16 }}>
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#cbd5e1" strokeDasharray="6 6" />
    {path ? <polyline points={path} fill="none" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : <text x={width / 2} y={height / 2} textAnchor="middle" fill="#64748b">No delta data</text>}
  </svg>;
}