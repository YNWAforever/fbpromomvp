import { withDatabase } from "@/db/client";
import { env } from "@/env";
import { getPromotion } from "@/db/repositories/promotions";
import { getRedemptionReport } from "@/db/repositories/reports";
import { getVenue } from "@/db/repositories/venues";
import { verifyScopedToken } from "@/lib/security/signed-token";
import RedemptionForm from "./redemption-form";

function InvalidLink() {
  return <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6"><section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold text-slate-900">Redemption link unavailable</h1><p className="mt-2 text-sm text-slate-600">This link is invalid, expired, or no longer available.</p></section></main>;
}

export default async function RedemptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scoped = verifyScopedToken(token, env.OWNER_LINK_SECRET, "promotion");
  if (!scoped) return <InvalidLink />;
  const data = await withDatabase(async (db) => {
    const promotion = await getPromotion(db, scoped.subject);
    if (!promotion || promotion.state !== "accepted") return null;
    const [venue, redemption] = await Promise.all([getVenue(db, promotion.venueId), getRedemptionReport(db, promotion.id)]);
    if (!venue) return null;
    return { promotion, venue, redemption };
  });
  if (!data) return <InvalidLink />;
  const timezone = data.venue.timezone ?? "Asia/Hong_Kong";
  const validUntil = new Date(data.promotion.validUntil).toLocaleString("en-HK", { timeZone: timezone });
  const acceptedAt = data.promotion.acceptedAt ? new Date(data.promotion.acceptedAt).toLocaleString("en-HK", { timeZone: timezone }) : "";
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <section className="mx-auto max-w-lg space-y-5 py-6">
        <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
          <p className="text-sm text-slate-300">Aggregate redemption report</p>
          <h1 className="mt-2 text-2xl font-semibold">{data.venue.name}</h1>
          <p className="mt-3 text-sm text-slate-300">Campaign code: <span className="font-mono text-white">{data.promotion.campaignCode}</span></p>
          {acceptedAt ? <p className="mt-1 text-xs text-slate-400">Sent {acceptedAt} · valid until {validUntil}</p> : null}
        </header>
        <RedemptionForm token={token} priorCount={data.redemption?.count ?? null} />
      </section>
    </main>
  );
}