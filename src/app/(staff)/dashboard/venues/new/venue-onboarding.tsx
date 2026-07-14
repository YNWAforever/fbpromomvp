"use client";

import { useActionState, useState } from "react";
import { checkVenueCoverageFormAction, confirmVenueMatchFormAction, createDraftVenueFormAction } from "./actions";

type CoverageReason = "no_data" | "provider_error" | "provider_timeout" | "credentials_unavailable";
type CoverageState = { available?: boolean; providerVenueId?: string; matchedName?: string; matchedAddress?: string; forecast?: Record<string, unknown>; reason?: CoverageReason; fetchedAt?: string | Date };
type MatchState = { totalScore?: number; nameScore?: number; addressScore?: number; decision?: string };
type ActivationState = { blockers?: string[]; allowed?: boolean };
type ActionState = {
  ok?: boolean;
  error?: string;
  venueId?: string;
  submitted?: { name?: string; address?: string };
  coverage?: CoverageState;
  match?: MatchState;
  status?: "available" | "unavailable" | "needs_match_review" | "blocked";
  notApplicable?: boolean;
  reason?: CoverageReason;
  activation?: ActivationState;
};

const initialState: ActionState = { ok: false };

function unavailableMessage(reason?: CoverageReason): string {
  switch (reason) {
    case "provider_timeout":
      return "BestTime timed out before returning a forecast.";
    case "credentials_unavailable":
      return "BestTime credentials are unavailable.";
    case "provider_error":
      return "BestTime is temporarily unavailable.";
    default:
      return "BestTime did not return coverage data for this venue.";
  }
}

export default function VenueOnboarding() {
  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(async (_previous, formData) => (await createDraftVenueFormAction(formData)) as ActionState, initialState);
  const [coverageState, coverageAction, coveragePending] = useActionState<ActionState, FormData>(async (_previous, formData) => (await checkVenueCoverageFormAction(formData)) as ActionState, initialState);
  const [confirmState, confirmAction, confirmPending] = useActionState<ActionState, FormData>(async (_previous, formData) => (await confirmVenueMatchFormAction(formData)) as ActionState, initialState);
  const [requestKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`);
  const venueId = typeof createState.venueId === "string" ? createState.venueId : "";
  const submitted = createState.submitted;
  const coverage = coverageState.coverage;
  const match = coverageState.match;
  const activation = confirmState.activation;
  const status = coverageState.status;
  const notApplicable = coverageState.notApplicable === true || status === "unavailable";
  const coverageReason = coverageState.reason ?? coverage?.reason;
  const blockedMatch = status === "blocked" || match?.decision === "blocked";

  return (
    <div className="max-w-4xl">
      <div>
        <p className="text-sm font-medium text-cyan-300">Venues</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Add a venue</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Coverage is checked through BestTime and shown beside the submitted identity. A staff confirmation is always required before monitoring can begin.</p>
      </div>

      <form action={createAction} className="mt-8 space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <input type="hidden" name="requestKey" value={requestKey} />
        <div className="grid gap-5 md:grid-cols-2">
          <label className="text-sm text-slate-300">Venue name<input name="name" required className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Category<input name="category" required className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300 md:col-span-2">Address<input name="address" required className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Timezone<input name="timezone" defaultValue="Asia/Hong_Kong" required className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Business hours JSON<textarea name="businessHours" placeholder='{"Monday":[{"open":"09:00","close":"18:00"}]}' className="mt-2 block min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white" /></label>
          <label className="text-sm text-slate-300">WozTell owner reference<input name="ownerReference" className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">WozTell channel<input name="channelReference" className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">WozTell audience<input name="audienceReference" className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
        </div>
        <button type="submit" disabled={createPending} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{createPending ? "Saving…" : "Create draft venue"}</button>
        {createState.error && <p className="text-sm text-rose-300">{createState.error}</p>}
      </form>

      {venueId && (
        <>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm font-semibold text-white">Submitted venue</h2>
              <p className="mt-3 text-sm text-slate-300">{submitted?.name}</p>
              <p className="mt-1 text-sm text-slate-400">{submitted?.address}</p>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
              <h2 className="text-sm font-semibold text-amber-100">BestTime match</h2>
              {notApplicable ? (
                <div className="mt-3 space-y-2" role="status" aria-live="polite">
                  <p className="text-sm font-semibold text-amber-100">Not applicable</p>
                  <p className="text-sm text-amber-100/90">{unavailableMessage(coverageReason)}</p>
                  <p className="text-xs text-amber-200">No provider venue or forecast is available. Confirmation and activation remain disabled.</p>
                </div>
              ) : coverage ? (
                <>
                  <p className="mt-3 text-sm text-amber-100">{coverage.matchedName} — {coverage.matchedAddress}</p>
                  <p className="mt-2 text-xs text-amber-200">Provider venue: {coverage.providerVenueId ?? "Unavailable"}</p>
                  <p className="mt-2 text-xs text-amber-200">Score: {typeof match?.totalScore === "number" ? match.totalScore.toFixed(3) : "—"} ({match?.decision ?? "unavailable"})</p>
                  <p className="mt-2 text-xs text-slate-400">Forecast: {coverage.forecast ? "available" : "unavailable"}</p>
                </>
              ) : <p className="mt-3 text-sm text-amber-100/70">Run a coverage check to see the provider identity and score.</p>}
            </div>
          </div>

          <form action={coverageAction} className="mt-5 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <input type="hidden" name="venueId" value={venueId} /><input type="hidden" name="requestKey" value={`${requestKey}:coverage`} />
            <button type="submit" disabled={coveragePending} className="rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">{coveragePending ? "Checking…" : "Check coverage"}</button>
            {coverageState.error && <p className="text-sm text-rose-300">{coverageState.error}</p>}
          </form>

          {coverage?.available && !notApplicable && !blockedMatch && <form action={confirmAction} className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-5"><input type="hidden" name="venueId" value={venueId} /><input type="hidden" name="confirmed" value="true" /><button type="submit" disabled={confirmPending} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{confirmPending ? "Confirming…" : "Confirm match"}</button>{confirmState.error && <p className="mt-3 text-sm text-rose-300">{confirmState.error}</p>}</form>}
          {coverage?.available && blockedMatch && <p className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/5 p-5 text-sm text-rose-200" role="status">Blocked match — manual review is required before confirmation.</p>}

          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-sm font-semibold text-white">Activation checklist</h2><p className="mt-3 text-sm text-slate-400">Forecast, confirmed match, business hours, WozTell owner/channel/audience metadata, and an active offer template are required.</p>{notApplicable && <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-200">Not applicable — resolve BestTime coverage before activation.</p>}{blockedMatch && !notApplicable && <p className="mt-3 text-xs font-medium uppercase tracking-wide text-rose-200">Blocked — manual match review required.</p>}{activation && <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-200">{activation.allowed ? "Ready for activation" : `Blocked by: ${(activation.blockers ?? []).join(", ") || "review"}`}</p>}</section>
        </>
      )}
    </div>
  );
}
