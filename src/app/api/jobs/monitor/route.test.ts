import { beforeEach, describe, expect, it, vi } from "vitest";

const monitor = vi.hoisted(() => ({ monitorVenues: vi.fn() }));
const db = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const provider = vi.hoisted(() => ({ createBestTimeClient: vi.fn() }));
vi.mock("@/application/triggers/monitor-venues", () => monitor);
vi.mock("@/db/client", () => db);
vi.mock("@/integrations/besttime/client", () => provider);

import { signHmacRequest } from "@/lib/security/hmac";
import { POST } from "./route";

describe("POST /api/jobs/monitor", () => {
  const secret = "12345678901234567890123456789012";
  beforeEach(() => {
    vi.clearAllMocks();
    provider.createBestTimeClient.mockReturnValue({});
    db.withDatabase.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => work({}));
    monitor.monitorVenues.mockResolvedValue({ processed: 1, candidates: 1, suppressed: 0, failures: 0 });
  });
  function request(body: string) {
    const timestamp = String(Date.now());
    return new Request("http://localhost/api/jobs/monitor", {
      method: "POST", body,
      headers: {
        "content-type": "application/json", "x-job-timestamp": timestamp,
        "x-job-signature": signHmacRequest({ secret, timestamp, rawBody: body }),
        "idempotency-key": "hourly:test-run",
      },
    });
  }
  it("requires a signed request and validates the run payload", async () => {
    expect((await POST(new Request("http://localhost/api/jobs/monitor", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await POST(request(JSON.stringify({ runId: "run-1", scheduledAt: "not-a-date" })))).status).toBe(400);
  });
  it("passes the validated payload to the monitor service", async () => {
    const response = await POST(request(JSON.stringify({ runId: "run-1", scheduledAt: "2026-07-14T04:00:00.000Z" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 1, candidates: 1, suppressed: 0, failures: 0 });
    expect(monitor.monitorVenues).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", idempotencyKey: "hourly:test-run" }));
  });
  it("rejects a changed body", async () => {
    const body = JSON.stringify({ runId: "run-1", scheduledAt: "2026-07-14T04:00:00.000Z" });
    const timestamp = String(Date.now());
    const response = await POST(new Request("http://localhost/api/jobs/monitor", {
      method: "POST", body: `${body} `,
      headers: { "x-job-timestamp": timestamp, "x-job-signature": signHmacRequest({ secret, timestamp, rawBody: body }), "idempotency-key": "hourly:test-run" },
    }));
    expect(response.status).toBe(401);
    expect(monitor.monitorVenues).not.toHaveBeenCalled();
  });
});

