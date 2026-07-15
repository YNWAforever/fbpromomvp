import { NextResponse } from "next/server";
import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { sendPromotion } from "@/application/promotions/send-promotion";
import { createWozTellOpenApiClient } from "@/integrations/woztell/open-api-client";
import { verifyHmacRequest } from "@/lib/security/hmac";
function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }
export async function POST(request: Request) {
  const rawBody = await request.text(); const timestamp = request.headers.get("x-job-timestamp"); const signature = request.headers.get("x-job-signature"); const idempotencyKey = request.headers.get("idempotency-key");
  if (!timestamp || !signature || !idempotencyKey?.trim() || !verifyHmacRequest({ secret: env.N8N_HMAC_SECRET, timestamp, signature, rawBody })) return error("invalid job signature", 401);
  let body: unknown; try { body = JSON.parse(rawBody); } catch { return error("request body must be valid JSON", 400); }
  if (!body || typeof body !== "object") return error("request body must be an object", 400); const value = body as Record<string, unknown>;
  if (typeof value.promotionId !== "string" || typeof value.audienceId !== "string" || !value.messages || typeof value.messages !== "object") return error("promotionId, audienceId and messages are required", 400);
  try { const result = await withDatabase((db) => sendPromotion({ db, promotionId: value.promotionId as string, audienceId: value.audienceId as string, name: typeof value.name === "string" ? value.name : undefined, messages: value.messages as Record<string, unknown>, scheduleAt: typeof value.scheduleAt === "number" ? value.scheduleAt : undefined, provider: createWozTellOpenApiClient() })); return NextResponse.json(result, { status: 200 }); } catch { return error("promotion retry failed", 500); }
}
