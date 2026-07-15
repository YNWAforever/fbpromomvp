import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { getApproval, listCopyCandidates } from "@/db/repositories/triggers";
import { verifyScopedApprovalToken } from "@/lib/security/signed-token";
export const dynamic = "force-dynamic";
export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const scoped = verifyScopedApprovalToken(token, env.OWNER_LINK_SECRET);
  if (!scoped) return <main><h1>Approval link invalid or expired</h1><p>This link can no longer be used.</p></main>;
  const data = await withDatabase(async (db) => { const approval = await getApproval(db, scoped.approvalId); if (!approval || approval.venueId !== scoped.venueId) return undefined; const candidates = await listCopyCandidates(db, approval.triggerId); return { approval, candidates }; });
  if (!data) return <main><h1>Approval link invalid</h1><p>The approval does not belong to this venue.</p></main>;
  if (data.approval.state === "expired") return <main><h1>Approval expired</h1><p>No promotion was created.</p></main>;
  if (data.approval.state === "approved") return <main><h1>Approved</h1><p>Your promotion is queued for broadcast.</p></main>;
  return <main><h1>Review promotion</h1><p>Choose one approved message before the link expires.</p><form method="post"><input type="hidden" name="token" value={token} />{data.candidates.slice(0, 3).map((candidate) => <label key={candidate.id} style={{ display: "block", margin: "1rem 0" }}><input type="radio" name="candidateId" value={candidate.id} required /> {candidate.body}</label>)}<button name="action" value="approve" type="submit">Approve</button><button name="action" value="skip" type="submit">Skip</button></form></main>;
}
