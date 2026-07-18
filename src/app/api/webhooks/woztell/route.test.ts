import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const decision = vi.hoisted(() => ({ handleApprovalDecision: vi.fn() }));
const secrets = vi.hoisted(() => ({ env: { WOZTELL_WEBHOOK_SECRET: "webhook-secret" } }));
vi.mock("@/db/client", () => db);
vi.mock("@/application/approvals/handle-decision", () => decision);
vi.mock("@/env", () => secrets);

import { POST, timingSafeSecretEqual } from "./route";

describe("POST /api/webhooks/woztell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.withDatabase.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => work({}));
    decision.handleApprovalDecision.mockResolvedValue({ status: "approved", approval: { id: "approval-1" } });
  });
  it("uses timing-safe bearer validation and rejects malformed or missing credentials", async () => {
    expect(timingSafeSecretEqual("webhook-secret", "webhook-secret")).toBe(true);
    expect(timingSafeSecretEqual("webhook-secret", "wrong-secret")).toBe(false);
    expect((await POST(new Request("http://localhost/api/webhooks/woztell", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/webhooks/woztell", { method: "POST", body: "{}", headers: { authorization: "Bearer wrong-secret" } }))).status).toBe(401);
  });
  it("passes a valid signed decision payload to the approval service", async () => {
    const payload = { eventId: "event-1", approvalId: "approval-1", action: "approve", candidateId: "candidate-1", occurredAt: new Date().toISOString() };
    const response = await POST(new Request("http://localhost/api/webhooks/woztell", { method: "POST", body: JSON.stringify({ event: payload }), headers: { authorization: "Bearer webhook-secret", "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    expect(decision.handleApprovalDecision).toHaveBeenCalledWith(expect.objectContaining({ payload }));
  });
});