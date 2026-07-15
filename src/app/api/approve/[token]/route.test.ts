import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const decision = vi.hoisted(() => ({ handleApprovalDecision: vi.fn() }));
const security = vi.hoisted(() => ({ verifyScopedApprovalToken: vi.fn() }));
const secrets = vi.hoisted(() => ({ env: { OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456" } }));
vi.mock("@/db/client", () => db);
vi.mock("@/application/approvals/handle-decision", () => decision);
vi.mock("@/lib/security/signed-token", () => security);
vi.mock("@/env", () => secrets);

import { POST } from "./route";

describe("POST /api/approve/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    security.verifyScopedApprovalToken.mockReturnValue({ approvalId: "approval-1", venueId: "venue-1" });
    db.withDatabase.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => work({}));
    decision.handleApprovalDecision.mockResolvedValue({ status: "approved", approval: { id: "approval-1" } });
  });
  it("verifies the scoped token and forwards the signed owner decision", async () => {
    const form = new FormData();
    form.set("action", "approve");
    form.set("candidateId", "candidate-1");
    const response = await POST(new Request("http://localhost/api/approve/token", { method: "POST", body: form }), { params: Promise.resolve({ token: "token" }) });
    expect(response.status).toBe(200);
    expect(security.verifyScopedApprovalToken).toHaveBeenCalledWith("token", secrets.env.OWNER_LINK_SECRET);
    expect(decision.handleApprovalDecision).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ approvalId: "approval-1", venueId: "venue-1", action: "approve", candidateId: "candidate-1" }) }));
  });
  it("fails closed for a tampered token", async () => {
    security.verifyScopedApprovalToken.mockReturnValue(undefined);
    const response = await POST(new Request("http://localhost/api/approve/tampered", { method: "POST", body: new FormData() }), { params: Promise.resolve({ token: "tampered" }) });
    expect(response.status).toBe(400);
    expect(decision.handleApprovalDecision).not.toHaveBeenCalled();
  });
});