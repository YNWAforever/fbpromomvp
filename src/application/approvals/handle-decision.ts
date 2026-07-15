import { z } from "zod";
import type { DatabaseExecutor } from "@/db/client";
import { appendAuditEvent, findAuditEventByIdempotencyKey } from "@/db/repositories/audit";
import { createPromotion, findPromotionByApprovalId } from "@/db/repositories/promotions";
import { getApproval, listCopyCandidates, updateApproval } from "@/db/repositories/triggers";
import { validateCopyCandidate } from "@/domain/copy/validate";
import { createCampaignCode } from "@/domain/promotions/code";
import { resolveApproval, type ApprovalAction } from "@/domain/approvals/resolve";

export const decisionSchema = z.object({ eventId: z.string().trim().min(1).max(200), approvalId: z.string().trim().min(1), action: z.enum(["select", "edit", "approve", "skip"]), candidateId: z.string().trim().min(1).optional(), editedBody: z.string().trim().max(500).optional(), occurredAt: z.union([z.string(), z.date()]), venueId: z.string().trim().min(1).optional() });
export type ApprovalDecisionPayload = z.infer<typeof decisionSchema>;
export type ApprovalDecisionResult = { status: "duplicate" | "invalid" | "expired" | "selected" | "edited" | "skipped" | "approved"; approval?: Record<string, unknown>; promotion?: Record<string, unknown>; reason?: string };
type Candidate = { id: string; triggerId?: string; body?: string; [key: string]: unknown };
type Approval = { id: string; venueId: string; triggerId: string; state: string; selectedCandidateId?: string | null; expiresAt: Date; [key: string]: unknown };
type Repositories = { getApproval: typeof getApproval; updateApproval: typeof updateApproval; listCopyCandidates: typeof listCopyCandidates; createPromotion: typeof createPromotion; findPromotionByApprovalId: typeof findPromotionByApprovalId; appendAuditEvent: typeof appendAuditEvent; findAuditEventByIdempotencyKey: typeof findAuditEventByIdempotencyKey; updateCopyCandidate?: (db: DatabaseExecutor, id: string, values: Record<string, unknown>) => Promise<unknown>; checkLimits?: (input: { db: DatabaseExecutor; venueId: string; now: Date }) => Promise<boolean> };
async function inTransaction<T>(db: DatabaseExecutor, work: (executor: DatabaseExecutor) => Promise<T>): Promise<T> { const candidate = db as DatabaseExecutor & { transaction?: (fn: (tx: DatabaseExecutor) => Promise<T>) => Promise<T> }; return typeof candidate.transaction === "function" ? candidate.transaction(work) : work(db); }

export async function handleApprovalDecision(input: { db: DatabaseExecutor; payload: ApprovalDecisionPayload; now?: Date; facts?: { headline: string; benefit: string; conditions: string[] }; repositories?: Partial<Repositories> }): Promise<ApprovalDecisionResult> {
  const payload = decisionSchema.parse(input.payload);
  const occurredAt = payload.occurredAt instanceof Date ? payload.occurredAt : new Date(payload.occurredAt); if (Number.isNaN(occurredAt.getTime())) return { status: "invalid", reason: "occurred_at_invalid" };
  const repository = { getApproval, updateApproval, listCopyCandidates, createPromotion, findPromotionByApprovalId, appendAuditEvent, findAuditEventByIdempotencyKey, ...input.repositories } as Repositories;
  const eventKey = `woztell:event:${payload.eventId}`;
  if (await repository.findAuditEventByIdempotencyKey(input.db, eventKey)) return { status: "duplicate" };
  const now = input.now ?? new Date();
  return inTransaction(input.db, async (db) => {
    const approval = await repository.getApproval(db, payload.approvalId) as unknown as Approval | undefined;
    if (!approval) return { status: "invalid", reason: "approval_not_found" };
    if (payload.venueId && payload.venueId !== approval.venueId) return { status: "invalid", reason: "venue_mismatch" };
    const resolution = resolveApproval({ state: approval.state, now, expiresAt: new Date(approval.expiresAt), action: payload.action as ApprovalAction });
    if (resolution.next === "expired") {
      const updated = await repository.updateApproval(db, approval.id, { state: "expired", resolvedAt: now } as never);
      await repository.appendAuditEvent(db, { actorType: "owner", action: "approval_expired", objectType: "approval", objectId: approval.id, idempotencyKey: eventKey, metadata: { venueId: approval.venueId, eventId: payload.eventId } });
      return { status: "expired", approval: updated as unknown as Record<string, unknown> };
    }
    if (resolution.next === "unchanged") return { status: "invalid", reason: "approval_not_pending" };
    const candidates = await repository.listCopyCandidates(db, approval.triggerId) as unknown as Candidate[];
    const candidateId = payload.candidateId ?? approval.selectedCandidateId ?? undefined;
    const candidate = candidateId ? candidates.find((row) => row.id === candidateId) : undefined;
    if ((payload.action === "select" || payload.action === "approve") && !candidate) return { status: "invalid", reason: "candidate_not_found" };
    if (candidate && candidate.triggerId && candidate.triggerId !== approval.triggerId) return { status: "invalid", reason: "candidate_venue_mismatch" };
    if (payload.action === "edit") {
      if (!payload.editedBody || !input.facts) return { status: "invalid", reason: "edited_body_required" };
      const validation = validateCopyCandidate(payload.editedBody, input.facts, { expiresAt: new Date(approval.expiresAt).toISOString() });
      if (!validation.valid) return { status: "invalid", reason: validation.validationErrors.join(",") };
      if (candidate && repository.updateCopyCandidate) await repository.updateCopyCandidate(db, candidate.id, { body: payload.editedBody, source: "owner_edit", valid: true, validationErrors: [] });
      const updated = await repository.updateApproval(db, approval.id, { state: "edited", ...(candidate ? { selectedCandidateId: candidate.id } : {}) } as never);
      await repository.appendAuditEvent(db, { actorType: "owner", action: "approval_edited", objectType: "approval", objectId: approval.id, idempotencyKey: eventKey, metadata: { venueId: approval.venueId, candidateId: candidate?.id, eventId: payload.eventId } });
      return { status: "edited", approval: updated as unknown as Record<string, unknown> };
    }
    if (payload.action === "select") {
      const updated = await repository.updateApproval(db, approval.id, { state: "selected", selectedCandidateId: candidate!.id } as never);
      await repository.appendAuditEvent(db, { actorType: "owner", action: "approval_selected", objectType: "approval", objectId: approval.id, idempotencyKey: eventKey, metadata: { venueId: approval.venueId, candidateId: candidate!.id, eventId: payload.eventId } });
      return { status: "selected", approval: updated as unknown as Record<string, unknown> };
    }
    if (payload.action === "skip") {
      const updated = await repository.updateApproval(db, approval.id, { state: "skipped", resolvedAt: now } as never);
      await repository.appendAuditEvent(db, { actorType: "owner", action: "approval_skipped", objectType: "approval", objectId: approval.id, idempotencyKey: eventKey, metadata: { venueId: approval.venueId, eventId: payload.eventId } });
      return { status: "skipped", approval: updated as unknown as Record<string, unknown> };
    }
    if (repository.checkLimits && !(await repository.checkLimits({ db, venueId: approval.venueId, now }))) return { status: "invalid", reason: "limit_reached" };
    const body = payload.editedBody ?? candidate!.body;
    if (!body) return { status: "invalid", reason: "candidate_body_missing" };
    if (input.facts) { const validation = validateCopyCandidate(body, input.facts); if (!validation.valid) return { status: "invalid", reason: validation.validationErrors.join(",") }; }
    const existing = await repository.findPromotionByApprovalId(db, approval.id) as unknown as Record<string, unknown> | undefined;
    const promotion = existing ?? await repository.createPromotion(db, { venueId: approval.venueId, approvalId: approval.id, campaignCode: createCampaignCode(approval.id), body, state: "queued", validFrom: now, validUntil: new Date(now.getTime() + 2 * 60 * 60 * 1000) } as never) as unknown as Record<string, unknown>;
    const updated = await repository.updateApproval(db, approval.id, { state: "approved", selectedCandidateId: candidate!.id, resolvedAt: now } as never);
    await repository.appendAuditEvent(db, { actorType: "owner", action: "approval_approved", objectType: "approval", objectId: approval.id, idempotencyKey: eventKey, metadata: { venueId: approval.venueId, promotionId: promotion?.id, eventId: payload.eventId } });
    return { status: "approved", approval: updated as unknown as Record<string, unknown>, promotion };
  });
}


