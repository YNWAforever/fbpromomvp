import EmptyState from "@/components/empty-state";
import OperationsTable from "@/components/operations-table";
import { withDatabase } from "@/db/client";
import { listPromotions } from "@/db/repositories/promotions";
import { requireStaff } from "@/lib/auth/require-staff";
import { cancelPromotionFormAction, retryPromotionFormAction } from "./actions";

function reasonForPromotion(promotion: { providerReceipt?: unknown }) {
  const receipt = promotion.providerReceipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return undefined;
  const reason = (receipt as Record<string, unknown>).reason ?? (receipt as Record<string, unknown>).errorCode;
  return typeof reason === "string" ? reason : undefined;
}

export default async function OperationsPage() {
  await requireStaff();
  const promotions = await withDatabase((db) => listPromotions(db));
  if (!promotions.length) return <EmptyState title="No operations" description="Promotion jobs, approvals, and delivery outcomes will appear here as the engine runs." />;
  return <div><p className="text-sm font-medium text-cyan-300">Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Promotion triage</h1><div className="mt-8"><OperationsTable rows={promotions.map((promotion) => ({ id: promotion.id, state: promotion.state, reason: reasonForPromotion(promotion), onRetry: retryPromotionFormAction, onCancel: cancelPromotionFormAction }))} /></div></div>;
}