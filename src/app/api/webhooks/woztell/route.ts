import { NextResponse } from "next/server";
import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { handleApprovalDecision, type ApprovalDecisionPayload } from "@/application/approvals/handle-decision";
function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }
export async function POST(request: Request) {
  const expected = env.WOZTELL_WEBHOOK_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "").trim();
  if (!expected || !supplied || supplied !== expected) return error("unauthorized", 401);
  let body: unknown; try { body = await request.json(); } catch { return error("request body must be valid JSON", 400); }
  if (!body || typeof body !== "object") return error("request body must be an object", 400);
  const payload = ((body as Record<string, unknown>).event ?? body) as ApprovalDecisionPayload;
  try {
    const result = await withDatabase((db) => handleApprovalDecision({ db, payload }));
    const status = result.status === "invalid" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch { return error("invalid webhook payload", 400); }
}
