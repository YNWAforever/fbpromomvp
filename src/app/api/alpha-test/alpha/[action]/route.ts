import { NextResponse } from "next/server";
import { verifyHmacRequest } from "@/lib/security/hmac";
import { env } from "@/env";
import { getAlphaHarness, resetAlphaHarness } from "@/testing/alpha-harness";
import { isTestRuntime } from "@/testing/test-runtime";

type Context = { params: Promise<{ action: string }> };
function unavailable() { return NextResponse.json({ error: "not found" }, { status: 404 }); }
function invalid(message: string) { return NextResponse.json({ error: message }, { status: 400 }); }
function signed(request: Request, rawBody: string) {
  const timestamp = request.headers.get("x-job-timestamp") ?? "";
  const signature = request.headers.get("x-job-signature") ?? "";
  return Boolean(request.headers.get("idempotency-key")) && verifyHmacRequest({ secret: env.N8N_HMAC_SECRET, timestamp, signature, rawBody });
}

export async function GET(_request: Request, context: Context) {
  if (!isTestRuntime()) return unavailable();
  const { action } = await context.params;
  return action === "snapshot" ? NextResponse.json(getAlphaHarness().snapshot()) : unavailable();
}

export async function POST(request: Request, context: Context) {
  if (!isTestRuntime()) return unavailable();
  const { action } = await context.params;
  if (action === "reset") return NextResponse.json(resetAlphaHarness());
  const rawBody = await request.text();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (action === "hourly" || action === "weekly" || action === "approve") {
    if (!idempotencyKey || !signed(request, rawBody)) return NextResponse.json({ error: "invalid signed callback" }, { status: 401 });
    try {
      JSON.parse(rawBody);
      const alpha = getAlphaHarness();
      if (action === "hourly") return NextResponse.json(await alpha.runHourly(idempotencyKey));
      if (action === "weekly") return NextResponse.json(await alpha.runWeekly(idempotencyKey));
      return NextResponse.json(await alpha.approve(idempotencyKey));
    } catch (error) { return invalid(error instanceof Error ? error.message : "invalid request"); }
  }
  const body = (() => { try { return JSON.parse(rawBody) as Record<string, unknown>; } catch { return null; } })();
  if (!body) return invalid("request body must be valid JSON");
  try {
    const alpha = getAlphaHarness();
    if (action === "onboard") { if (typeof body.name !== "string" || typeof body.address !== "string") return invalid("name and address are required"); return NextResponse.json(await alpha.onboard({ name: body.name, address: body.address })); }
    if (action === "confirm-match") return NextResponse.json(await alpha.confirmMatch());
    if (action === "redemptions") { if (typeof body.count !== "number") return invalid("count is required"); return NextResponse.json(await alpha.reportRedemptions(body.count)); }
  } catch (error) { return invalid(error instanceof Error ? error.message : "invalid request"); }
  return unavailable();
}
