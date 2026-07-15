import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { handleApprovalDecision, type ApprovalDecisionPayload } from "@/application/approvals/handle-decision";

function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

/** Compare secret material without exposing length or early-exit timing differences. */
export function timingSafeSecretEqual(supplied: string | undefined, expected: string | undefined): boolean {
  if (!supplied || !expected) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = env.WOZTELL_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = /^Bearer\s+(.+)$/iu.exec(authorization)?.[1]?.trim();
  if (!timingSafeSecretEqual(supplied, expected)) return error("unauthorized", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return error("request body must be valid JSON", 400); }
  if (!body || typeof body !== "object") return error("request body must be an object", 400);
  const payload = ((body as Record<string, unknown>).event ?? body) as ApprovalDecisionPayload;
  try {
    const result = await withDatabase((db) => handleApprovalDecision({ db, payload }));
    const status = result.status === "invalid" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch { return error("invalid webhook payload", 400); }
}