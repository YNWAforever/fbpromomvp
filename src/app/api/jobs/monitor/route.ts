import { NextResponse } from "next/server";
import { withDatabase } from "@/db/client";
import { env } from "@/env";
import { monitorVenues } from "@/application/triggers/monitor-venues";
import { createBestTimeClient } from "@/integrations/besttime/client";
import { verifyHmacRequest } from "@/lib/security/hmac";
import { createApproval } from "@/db/repositories/triggers";
import { getAcceptedPromotionCounts, hasPendingPromotion as hasPendingPromotionInWindow } from "@/db/repositories/promotions";

type CandidateVenue = {
  id: string;
  timezone?: string | null;
  approvalTimeoutMinutes?: number | null;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function dispatchCandidate(db: Parameters<typeof createApproval>[0], triggerId: string, venue: CandidateVenue, now: Date) {
  const timeoutMinutes = Math.max(1, Math.min(venue.approvalTimeoutMinutes ?? 15, 15));
  const approval = await createApproval(db, {
    venueId: venue.id,
    triggerId,
    state: "pending",
    expiresAt: new Date(now.getTime() + timeoutMinutes * 60 * 1000),
  });
  if (!approval) throw new Error(`approval for trigger ${triggerId} was not persisted`);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-job-timestamp");
  const signature = request.headers.get("x-job-signature");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!timestamp || !signature || !idempotencyKey?.trim()) return errorResponse("missing job authentication headers", 401);
  if (!verifyHmacRequest({ secret: env.N8N_HMAC_SECRET, timestamp, signature, rawBody })) return errorResponse("invalid job signature", 401);
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return errorResponse("request body must be valid JSON", 400); }
  if (!payload || typeof payload !== "object") return errorResponse("request body must be an object", 400);
  const body = payload as Record<string, unknown>;
  if (typeof body.runId !== "string" || !body.runId.trim() || typeof body.scheduledAt !== "string" || Number.isNaN(Date.parse(body.scheduledAt))) {
    return errorResponse("runId and scheduledAt are required", 400);
  }
  const now = new Date(body.scheduledAt as string);
  try {
    const result = await withDatabase((db) => monitorVenues({
      db,
      provider: createBestTimeClient(),
      runId: body.runId as string,
      idempotencyKey: idempotencyKey.trim(),
      now,
      tenantId: typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : undefined,
      getAcceptedCounts: (executor, venue, instant) => getAcceptedPromotionCounts(executor, venue.id, instant, venue.timezone ?? "Asia/Hong_Kong"),
      hasPendingPromotion: (executor, venue, instant) => hasPendingPromotionInWindow(executor, venue.id, instant),
      candidateDispatcher: (triggerId, venue) => dispatchCandidate(db, triggerId, venue, now),
    }));
    return NextResponse.json(result, { status: 200 });
  } catch { return errorResponse("monitor job failed", 500); }
}
