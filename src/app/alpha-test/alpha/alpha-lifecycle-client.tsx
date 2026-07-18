"use client";

import { useEffect, useState } from "react";

type Snapshot = { stage: string; hourlyRuns: number; approvalsSent: number; broadcastsAccepted: number; redemptions: number; weeklyReportsSent: number; reportSummary: string | null };
const initial: Snapshot = { stage: "new", hourlyRuns: 0, approvalsSent: 0, broadcastsAccepted: 0, redemptions: 0, weeklyReportsSent: 0, reportSummary: null };

export default function AlphaLifecycleClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/alpha-test/alpha/snapshot")
      .then(async (response) => ({ response, value: await response.json() as Snapshot & { error?: string } }))
      .then(({ response, value }) => {
        if (!active) return;
        if (!response.ok) { setError(value.error ?? "snapshot failed"); return; }
        setSnapshot(value);
      })
      .catch(() => { if (active) setError("snapshot failed"); });
    return () => { active = false; };
  }, []);

  const call = async (action: string, body: Record<string, unknown> = {}) => {
    setError(null);
    const response = await fetch(`/api/alpha-test/alpha/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json() as Snapshot & { error?: string };
    if (!response.ok) { setError(value.error ?? "request failed"); return; }
    setSnapshot(value);
  };
  return <main className="mx-auto max-w-xl space-y-5 p-8"><h1>Alpha test lifecycle</h1><p data-testid="stage">{snapshot.stage}</p><button onClick={() => call("onboard", { name: "Harbour Cafe", address: "18 Pier Road, Central" })}>Onboard venue</button><button onClick={() => call("confirm-match")}>Confirm match</button><button onClick={() => call("redemptions", { count: 8 })}>Record 8 redemptions</button><p data-testid="approvals">Approvals sent: {snapshot.approvalsSent}</p><p data-testid="broadcasts">Accepted broadcasts: {snapshot.broadcastsAccepted}</p><p data-testid="redemptions">Redemptions: {snapshot.redemptions}</p>{snapshot.reportSummary && <p data-testid="report-summary">{snapshot.reportSummary}</p>}{error && <p role="alert">{error}</p>}</main>;
}
