import { NextResponse } from "next/server";
import { withDatabase } from "@/db/client";
import { env } from "@/env";
import { monitorVenues } from "@/application/triggers/monitor-venues";
import { createBestTimeClient } from "@/integrations/besttime/client";
import { verifyHmacRequest } from "@/lib/security/hmac";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
  try {
    const result = await withDatabase((db) => monitorVenues({
      db,
      provider: createBestTimeClient(),
      runId: body.runId as string,
      idempotencyKey: idempotencyKey.trim(),
      now: new Date(body.scheduledAt as string),
      tenantId: typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : undefined,
    }));
    return NextResponse.json(result, { status: 200 });
  } catch { return errorResponse("monitor job failed", 500); }
}

