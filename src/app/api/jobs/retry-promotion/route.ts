import { NextResponse } from "next/server";
import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { claimJobRun, updateJobRun } from "@/db/repositories/jobs";
import { sendPromotion } from "@/application/promotions/send-promotion";
import { createWozTellOpenApiClient } from "@/integrations/woztell/open-api-client";
import { verifyHmacRequest } from "@/lib/security/hmac";

function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-job-timestamp");
  const signature = request.headers.get("x-job-signature");
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!timestamp || !signature || !idempotencyKey || !verifyHmacRequest({ secret: env.N8N_HMAC_SECRET, timestamp, signature, rawBody })) return error("invalid job signature", 401);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return error("request body must be valid JSON", 400); }
  if (!body || typeof body !== "object") return error("request body must be an object", 400);
  const value = body as Record<string, unknown>;
  if (typeof value.promotionId !== "string" || typeof value.audienceId !== "string") return error("promotionId and audienceId are required", 400);
  const promotionId = value.promotionId as string;
  const audienceId = value.audienceId as string;

  try {
    return await withDatabase(async (db) => {
      const claimed = await claimJobRun(db, { kind: "retry-promotion", idempotencyKey, state: "running", attempts: 1, result: null, completedAt: null });
      if (!claimed.claimed) {
        if (claimed.run?.state === "completed") return NextResponse.json(claimed.run.result ?? { status: "completed" }, { status: 200 });
        return NextResponse.json({ status: "in_progress" }, { status: 202 });
      }
      try {
        const result = await sendPromotion({
          db,
          promotionId,
          audienceId,
          name: typeof value.name === "string" ? value.name : undefined,
          scheduleAt: typeof value.scheduleAt === "number" ? value.scheduleAt : undefined,
          priority: typeof value.priority === "string" || typeof value.priority === "number" ? value.priority : undefined,
          provider: createWozTellOpenApiClient(),
        });
        await updateJobRun(db, claimed.run!.id, { state: "completed", result: result as unknown as Record<string, unknown>, completedAt: new Date() });
        return NextResponse.json(result, { status: 200 });
      } catch (cause) {
        await updateJobRun(db, claimed.run!.id, { state: "failed", result: { error: cause instanceof Error ? cause.message : "promotion retry failed" }, completedAt: new Date() });
        return error("promotion retry failed", 500);
      }
    });
  } catch { return error("promotion retry failed", 500); }
}