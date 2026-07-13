import { requireStaff } from "@/lib/auth/require-staff";
import { createDraftVenueFormAction, checkVenueCoverageFormAction, confirmVenueMatchFormAction } from "./actions";

export default async function NewVenuePage() {
  await requireStaff();
  return (
    <div className="max-w-4xl">
      <div>
        <p className="text-sm font-medium text-cyan-300">Venues</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Add a venue</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Coverage is checked through BestTime and shown beside the submitted identity. A staff confirmation is always required before monitoring can begin.
        </p>
      </div>

      <form action={createDraftVenueFormAction} className="mt-8 space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
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
        <button type="submit" className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200">Create draft venue</button>
      </form>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-white">Submitted venue</h2>
          <p className="mt-3 text-sm text-slate-400">Your name and address are retained as the source identity for review.</p>
        </div>
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
          <h2 className="text-sm font-semibold text-amber-100">BestTime match</h2>
          <p className="mt-3 text-sm text-amber-100/70">Run a coverage check to see the provider identity and score.</p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-200">Needs match review</p>
          <p className="mt-1 text-xs text-slate-400">A high score still requires an explicit staff confirmation.</p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="text-sm font-semibold text-white">Activation checklist</h2>
        <p className="mt-3 text-sm text-slate-400">Forecast, confirmed match, business hours, WozTell owner/channel/audience metadata, and an active offer template are required.</p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Unavailable coverage: Not applicable</p>
      </section>

      <div className="sr-only">
        <form action={checkVenueCoverageFormAction}><input name="venueId" /><button type="submit">Check coverage</button></form>
        <form action={confirmVenueMatchFormAction}><input name="venueId" /><input name="confirmed" value="true" readOnly /><button type="submit">Confirm match</button></form>
      </div>
    </div>
  );
}
