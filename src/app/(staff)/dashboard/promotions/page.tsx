import Link from "next/link";
import EmptyState from "@/components/empty-state";
import StatusBadge from "@/components/status-badge";
import { withDatabase } from "@/db/client";
import { listPromotions } from "@/db/repositories/promotions";
import { requireStaff } from "@/lib/auth/require-staff";

export default async function PromotionsPage() {
  await requireStaff();
  const promotions = await withDatabase((db) => listPromotions(db));
  return (
    <div>
      <p className="text-sm font-medium text-cyan-300">Promotions</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Promotion history</h1>
      <div className="mt-8">{promotions.length === 0 ? <EmptyState title="No promotions" description="Approved and attempted promotions will appear here." /> : <div className="space-y-3">{promotions.map((promotion) => <Link key={promotion.id} href={"/dashboard/promotions/" + promotion.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5 hover:border-cyan-300/50"><div><h2 className="font-semibold text-white">{promotion.campaignCode}</h2><p className="mt-1 text-sm text-slate-400">{promotion.body}</p></div><StatusBadge status={promotion.state} /></Link>)}</div>}</div>
    </div>
  );
}