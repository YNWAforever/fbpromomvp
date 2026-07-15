import { createHmac } from "node:crypto";
import type { DatabaseExecutor } from "@/db/client";
import {
  createApproval as persistApproval,
  createCopyCandidates as persistCopyCandidates,
  findApprovalByTriggerId as findPersistedApproval,
  updateApproval as updatePersistedApproval,
  listCopyCandidates as listPersistedCopyCandidates,
} from "@/db/repositories/triggers";
import { appendAuditEvent as persistAuditEvent, findAuditEventByIdempotencyKey as findPersistedAuditEvent } from "@/db/repositories/audit";
import { fallbackCandidates } from "@/domain/copy/fallback";
import { normalizeCopyBody, validateCopyCandidate } from "@/domain/copy/validate";
import type { CopyCandidate, CopyInput, CopyProvider, OfferFacts } from "@/domain/copy/types";
import type { ApprovalMessage, MessagingProvider } from "@/integrations/woztell/bot-client";

export type ScopedOwnerLinkInput = {
  baseUrl: string;
  secret: string;
  venueId: string;
  approvalId: string;
  expiresAt: Date;
};

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** Build an approval link whose signed payload is scoped to exactly one venue and approval. */
export function createScopedOwnerLink(input: ScopedOwnerLinkInput): string {
  const payload = encode(JSON.stringify({ kind: "approval", venueId: input.venueId, approvalId: input.approvalId, exp: Math.floor(input.expiresAt.getTime() / 1000) }));
  const signature = createHmac("sha256", input.secret).update(payload).digest("base64url");
  const base = input.baseUrl.replace(/\/+$/, "");
  return `${base}/approve/${payload}.${signature}`;
}

type ApprovalRow = { id: string; venueId?: string; triggerId?: string; state?: string; providerMessageId?: string | null; [key: string]: unknown };

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "23505" || (typeof candidate.message === "string" && /unique constraint|duplicate key/i.test(candidate.message));
}

export type CreateApprovalForTriggerInput = {
  db: DatabaseExecutor;
  triggerId: string;
  venueId: string;
  memberId: string;
  venueName: string;
  facts: OfferFacts;
  copyProvider: CopyProvider;
  messagingProvider: MessagingProvider;
  now?: Date;
  approvalTimeoutMinutes?: number;
  tone?: string;
  triggerContext?: Record<string, unknown>;
  ownerLink?: string;
  ownerLinkSecret?: string;
  appBaseUrl?: string;
  repositories?: Partial<{
    findApprovalByTriggerId: typeof findPersistedApproval;
    createCopyCandidates: typeof persistCopyCandidates;
    createApproval: typeof persistApproval;
    updateApproval: typeof updatePersistedApproval;
    appendAuditEvent: typeof persistAuditEvent;
    findAuditEventByIdempotencyKey: typeof findPersistedAuditEvent;
    listCopyCandidates: typeof listPersistedCopyCandidates;
  }>;
};

export type CreateApprovalForTriggerResult = {
  approval: ApprovalRow;
  candidates: CopyCandidate[];
  requestKey: string;
};

function normalizeCandidates(input: CopyInput, modelCandidates: CopyCandidate[]): CopyCandidate[] {
  const validModel: CopyCandidate[] = modelCandidates
    .map((candidate) => {
      const body = candidate.source === "owner_edit" ? candidate.body : normalizeCopyBody(candidate.body, input.expiresAt);
      const validation = validateCopyCandidate(body, input.facts, { expiresAt: input.expiresAt });
      return { body, source: (candidate.source === "owner_edit" ? "owner_edit" : "model") as "model" | "owner_edit", ...validation };
    })
    .filter((candidate) => candidate.valid);
  const output = [...validModel];
  for (const candidate of fallbackCandidates(input)) {
    if (output.length >= 3) break;
    if (!output.some((existing) => existing.body === candidate.body)) output.push(candidate);
  }
  return output.slice(0, 3);
}

/** Generate, persist, and send one idempotent approval request for a qualifying trigger. */
export async function createApprovalForTrigger(input: CreateApprovalForTriggerInput): Promise<CreateApprovalForTriggerResult> {
  const repository = input.repositories ?? {};
  const findApproval = repository.findApprovalByTriggerId ?? findPersistedApproval;
  const createCandidates = repository.createCopyCandidates ?? persistCopyCandidates;
  const createApproval = repository.createApproval ?? persistApproval;
  const updateApproval = repository.updateApproval ?? updatePersistedApproval;
  const appendAuditEvent = repository.appendAuditEvent ?? persistAuditEvent;
  const findAcceptedEvent = repository.findAuditEventByIdempotencyKey ?? findPersistedAuditEvent;
  const listCandidates = repository.listCopyCandidates ?? listPersistedCopyCandidates;
  const requestKey = "approval:" + input.venueId + ":" + input.triggerId;
  const existing = (await findApproval(input.db, input.triggerId, input.venueId)) as ApprovalRow | undefined;

  const reconcileAcceptedSend = async (approvalRow: ApprovalRow, providerMessageId: string): Promise<CreateApprovalForTriggerResult> => {
    try {
      const stateNeedsReset = approvalRow.state === "send_failed";
      const providerIdNeedsUpdate = approvalRow.providerMessageId !== providerMessageId;
      if (stateNeedsReset || providerIdNeedsUpdate) {
        await updateApproval(input.db, approvalRow.id, {
          ...(stateNeedsReset ? { state: "pending" } : {}),
          ...(providerIdNeedsUpdate ? { providerMessageId } : {}),
        });
      }
      await appendAuditEvent(input.db, {
        actorType: "system",
        action: "approval_requested",
        objectType: "approval",
        objectId: approvalRow.id,
        idempotencyKey: requestKey + ":requested",
        metadata: { venueId: input.venueId, triggerId: input.triggerId, candidateCount: 3, providerMessageId, requestKey },
      });
    } catch (error) {
      const persistenceError = new Error("WozTell approval accepted but local persistence failed");
      (persistenceError as Error & { code?: string; cause?: unknown }).code = "send_persistence_failed";
      (persistenceError as Error & { code?: string; cause?: unknown }).cause = error;
      throw persistenceError;
    }
    return { approval: { ...approvalRow, ...(approvalRow.state === "send_failed" ? { state: "pending" } : {}), providerMessageId }, candidates: [], requestKey };
  };

  let approval: ApprovalRow | undefined;
  let retryingSendFailure = false;
  if (existing) {
    if (existing.providerMessageId) {
      return reconcileAcceptedSend(existing, existing.providerMessageId);
    }

    let acceptedMessageId: string | undefined;
    if (findAcceptedEvent) {
      const acceptedEvent = await findAcceptedEvent(input.db, requestKey + ":accepted");
      const metadata = acceptedEvent?.metadata;
      if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const value = (metadata as Record<string, unknown>).providerMessageId;
        if (typeof value === "string" && value.trim()) acceptedMessageId = value.trim();
      }
    }
    if (acceptedMessageId) {
      return reconcileAcceptedSend(existing, acceptedMessageId);
    }

    if (existing.state !== "send_failed") {
      return { approval: existing, candidates: [], requestKey };
    }
    approval = existing;
    retryingSendFailure = true;
  }

  const now = input.now ?? new Date();
  const timeoutMinutes = Math.max(1, Math.min(input.approvalTimeoutMinutes ?? 15, 15));
  const approvalExpiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);
  const promotionExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  if (!approval) {
    try {
      approval = (await createApproval(input.db, {
        venueId: input.venueId,
        triggerId: input.triggerId,
        state: "pending",
        expiresAt: approvalExpiresAt,
      })) as ApprovalRow | undefined;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    if (!approval?.id) {
      const raced = (await findApproval(input.db, input.triggerId, input.venueId)) as ApprovalRow | undefined;
      if (raced) return { approval: raced, candidates: [], requestKey };
      throw new Error("approval for trigger " + input.triggerId + " was not persisted");
    }
  }

  const copyInput: CopyInput = {
    venueName: input.venueName,
    facts: input.facts,
    expiresAt: promotionExpiresAt.toISOString(),
    tone: input.tone ?? "friendly",
    triggerContext: input.triggerContext,
  };

  let candidates: CopyCandidate[] = [];
  let candidateRows: Array<{ id: string; body?: string; source?: string; ordinal?: number; version?: number }> = [];
  if (retryingSendFailure && listCandidates) {
    const persisted = await listCandidates(input.db, input.triggerId);
    candidateRows = [...(persisted as unknown as Array<{ id: string; body?: string; source?: string; ordinal?: number; version?: number }>)]
      .sort((left, right) => (left.version ?? 1) - (right.version ?? 1) || (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))
      .slice(0, 3);
    if (candidateRows.length === 3 && candidateRows.every((candidate) => candidate.id && candidate.body)) {
      candidates = candidateRows.map((candidate) => ({
        body: candidate.body!,
        source: candidate.source === "owner_edit" ? "owner_edit" : candidate.source === "model" ? "model" : "fallback",
        valid: true,
        validationErrors: [],
      }));
    } else {
      candidateRows = [];
    }
  }

  if (candidateRows.length !== 3) {
    let generated: CopyCandidate[] = [];
    try { generated = await input.copyProvider.generate(copyInput); } catch { generated = []; }
    candidates = normalizeCandidates(copyInput, generated);
    if (candidates.length !== 3) throw new Error("three grounded copy candidates are required");
    const persistedCandidates = await createCandidates(input.db, candidates.map((candidate, index) => ({
      triggerId: input.triggerId,
      ordinal: index,
      version: 1,
      provider: candidate.source === "model" ? "opencode-go" : "deterministic-fallback",
      body: candidate.body,
      source: candidate.source,
      valid: true,
      validationErrors: [],
    })));
    candidateRows = [...(persistedCandidates as unknown as Array<{ id: string; body?: string; source?: string; ordinal?: number; version?: number }>)]
      .sort((left, right) => (left.version ?? 1) - (right.version ?? 1) || (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))
      .slice(0, 3);
    if (candidateRows.length !== 3 || candidateRows.some((candidate) => !candidate.id)) throw new Error("copy candidates were not persisted");
  }

  const ownerLink = input.ownerLink ?? (input.ownerLinkSecret && input.appBaseUrl
    ? createScopedOwnerLink({ baseUrl: input.appBaseUrl, secret: input.ownerLinkSecret, venueId: input.venueId, approvalId: approval.id, expiresAt: approvalExpiresAt })
    : undefined);
  const message: ApprovalMessage = {
    approvalId: approval.id,
    venueId: input.venueId,
    memberId: input.memberId,
    expiresAt: approvalExpiresAt.toISOString(),
    requestKey,
    candidates: candidateRows.map((row, index) => ({ id: row.id, body: row.body ?? candidates[index]!.body })),
    ...(ownerLink ? { ownerLink } : {}),
  };

  let receipt: { messageId: string };
  try {
    receipt = await input.messagingProvider.sendApproval(message);
  } catch {
    await updateApproval(input.db, approval.id, { state: "send_failed" });
    await appendAuditEvent(input.db, {
      actorType: "system",
      action: "approval_send_failed",
      objectType: "approval",
      objectId: approval.id,
      idempotencyKey: requestKey + ":send_failed",
      metadata: { venueId: input.venueId, triggerId: input.triggerId, retryable: true, requestKey },
    });
    return { approval: { ...approval, state: "send_failed" }, candidates, requestKey };
  }

  const persistedSendState = retryingSendFailure
    ? { state: "pending", providerMessageId: receipt.messageId }
    : { providerMessageId: receipt.messageId };
  try {
    await updateApproval(input.db, approval.id, persistedSendState);
    await appendAuditEvent(input.db, {
      actorType: "system",
      action: "approval_requested",
      objectType: "approval",
      objectId: approval.id,
      idempotencyKey: requestKey + ":requested",
      metadata: { venueId: input.venueId, triggerId: input.triggerId, candidateCount: 3, providerMessageId: receipt.messageId, requestKey },
    });
  } catch (error) {
    try {
      await appendAuditEvent(input.db, {
        actorType: "system",
        action: "approval_send_persistence_failed",
        objectType: "approval",
        objectId: approval.id,
        idempotencyKey: requestKey + ":accepted",
        metadata: { venueId: input.venueId, triggerId: input.triggerId, state: "provider_accepted_local_persistence_pending", providerMessageId: receipt.messageId, requestKey },
      });
    } catch {
      // The provider message id may already have been persisted; reconciliation also checks the approval row.
    }
    const persistenceError = new Error("WozTell approval accepted but local persistence failed");
    (persistenceError as Error & { code?: string; cause?: unknown }).code = "send_persistence_failed";
    (persistenceError as Error & { code?: string; cause?: unknown }).cause = error;
    throw persistenceError;
  }
  return { approval: { ...approval, ...persistedSendState }, candidates, requestKey };
}