import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({ claimJobRun: vi.fn(), updateJobRun: vi.fn() }));
const db = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const promotion = vi.hoisted(() => ({ sendPromotion: vi.fn() }));
const provider = vi.hoisted(() => ({ createWozTellOpenApiClient: vi.fn() }));
vi.mock("@/db/repositories/jobs", () => jobs);
vi.mock("@/db/client", () => db);
vi.mock("@/application/promotions/send-promotion", () => promotion);
vi.mock("@/integrations/woztell/open-api-client", () => provider);

import { signHmacRequest } from "@/lib/security/hmac";
import { POST } from "./route";

describe("POST /api/jobs/retry-promotion", () => {
  const secret = "12345678901234567890123456789012";
  beforeEach(() => {
    vi.clearAllMocks();
    db.withDatabase.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => work({}));
    provider.createWozTellOpenApiClient.mockReturnValue({});
    promotion.sendPromotion.mockResolvedValue({ state: "accepted", attempts: 2, promotion: { id: "promotion-1" } });
  });
  function request(body: string, key = "retry:test") {
    const timestamp = String(Date.now());
    return new Request("http://localhost/api/jobs/retry-promotion", { method: "POST", body, headers: { "x-job-timestamp": timestamp, "x-job-signature": signHmacRequest({ secret, timestamp, rawBody: body }), "idempotency-key": key } });
  }
  it("claims the job key and derives broadcast content in the service", async () => {
    jobs.claimJobRun.mockResolvedValue({ claimed: true, run: { id: "run-1" } });
    jobs.updateJobRun.mockResolvedValue({});
    const response = await POST(request(JSON.stringify({ promotionId: "promotion-1", audienceId: "test-audience", messages: { body: "untrusted" } })));
    expect(response.status).toBe(200);
    expect(promotion.sendPromotion).toHaveBeenCalledWith(expect.objectContaining({ promotionId: "promotion-1", audienceId: "test-audience" }));
    expect(promotion.sendPromotion.mock.calls[0]?.[0]).not.toHaveProperty("messages");
    expect(jobs.updateJobRun).toHaveBeenCalledWith(expect.anything(), "run-1", expect.objectContaining({ state: "completed" }));
  });
  it("does not execute a completed idempotency key twice", async () => {
    jobs.claimJobRun.mockResolvedValue({ claimed: false, run: { id: "run-1", state: "completed", result: { state: "accepted" } } });
    const response = await POST(request(JSON.stringify({ promotionId: "promotion-1", audienceId: "test-audience" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "accepted" });
    expect(promotion.sendPromotion).not.toHaveBeenCalled();
  });
});