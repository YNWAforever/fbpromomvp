import Link from "next/link";
import EmptyState from "@/components/empty-state";
import StatusBadge from "@/components/status-badge";
import { withDatabase } from "@/db/client";
import { listActiveVenues } from "@/db/repositories/venues";
import { requireStaff } from "@/lib/auth/require-staff";

export default async function VenuesPage() {
  await requireStaff();
  const venues = await withDatabase((db) => listActiveVenues(db));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-cyan-300">Venues</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Active venues</h1></div>
        <Link className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950" href="/dashboard/venues/new">Add venue</Link>
      </div>
      <div className="mt-8">
        {venues.length === 0 ? <EmptyState title="No active venues" description="Add a venue and confirm its provider match to begin monitoring." action={{ label: "Add venue", href: "/dashboard/venues/new" }} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {venues.map((venue) => <Link key={venue.id} href={"/dashboard/venues/" + venue.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 hover:border-cyan-300/50"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-white">{venue.name}</h2><p className="mt-2 text-sm text-slate-400">{venue.timezone}</p></div><StatusBadge status={venue.status} /></div></Link>)}
          </div>
        )}
      </div>
    </div>
  );
}