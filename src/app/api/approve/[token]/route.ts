import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { handleApprovalDecision } from "@/application/approvals/handle-decision";
import { verifyScopedApprovalToken } from "@/lib/security/signed-token";
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const scoped = verifyScopedApprovalToken(token, env.OWNER_LINK_SECRET);
  if (!scoped) return NextResponse.json({ error: "invalid_or_expired_link" }, { status: 400 });
  const form = await request.formData(); const action = String(form.get("action") ?? "");
  if (!["select", "edit", "approve", "skip"].includes(action)) return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const result = await withDatabase((db) => handleApprovalDecision({ db, payload: { eventId: randomUUID(), approvalId: scoped.approvalId, venueId: scoped.venueId, action: action as "select" | "edit" | "approve" | "skip", candidateId: typeof form.get("candidateId") === "string" ? String(form.get("candidateId")) : undefined, editedBody: typeof form.get("editedBody") === "string" ? String(form.get("editedBody")) : undefined, occurredAt: new Date().toISOString() } }));
  return NextResponse.json(result, { status: result.status === "invalid" ? 400 : 200 });
}
