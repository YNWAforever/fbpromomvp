import { requireStaff } from "@/lib/auth/require-staff";

const emptyStates = [
  {
    title: "Active venues",
    description: "No active venues yet. Add a venue and confirm its provider match to begin monitoring.",
  },
  {
    title: "Pending approvals",
    description: "No promotion approvals are waiting for a staff decision.",
  },
  {
    title: "Recent operations",
    description: "Job runs, trigger readings, and delivery outcomes will appear here as the engine runs.",
  },
];

export default async function DashboardPage() {
  await requireStaff();
  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-cyan-300">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Rescue operations</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            A quiet, auditable view of venue coverage, approvals, and recovery activity.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
          No live activity
        </span>
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        {emptyStates.map((state) => (
          <section key={state.title} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold text-slate-100">{state.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{state.description}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
