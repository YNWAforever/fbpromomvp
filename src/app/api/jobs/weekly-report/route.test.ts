import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const jobs = vi.hoisted(() => ({ claimJobRun: vi.fn(), updateJobRun: vi.fn() }));
const generate = vi.hoisted(() => ({ generateWeeklyReports: vi.fn() }));
const send = vi.hoisted(() => ({ sendWeeklyReports: vi.fn() }));
const provider = vi.hoisted(() => ({ createWozTellReportClient: vi.fn() }));
vi.mock("@/db/client", () => db); vi.mock("@/db/repositories/jobs", () => jobs); vi.mock("@/application/reports/generate-weekly", () => generate); vi.mock("@/application/reports/send-weekly", () => send); vi.mock("@/integrations/woztell/report-client", () => provider);
import { signHmacRequest } from "@/lib/security/hmac";
import { POST } from "./route";

describe("POST /api/jobs/weekly-report", () => {
  const secret = "12345678901234567890123456789012";
  beforeEach(() => { vi.clearAllMocks(); db.withDatabase.mockImplementation(async (work: (executor: unknown) => Promise<unknown>) => work({})); jobs.claimJobRun.mockResolvedValue({ claimed: true, run: { id: "job-1" } }); generate.generateWeeklyReports.mockResolvedValue([{ venue: { id: "venue-1" }, report: { id: "report-1" }, ownerMemberId: "member-1" }]); send.sendWeeklyReports.mockResolvedValue({ total: 1, sent: 1, incomplete: 0, reports: [] }); provider.createWozTellReportClient.mockReturnValue({ sendReport: vi.fn() }); });
  function request(payload: unknown, key = "weekly-report:run-1") { const body = JSON.stringify(payload); const timestamp = String(Date.now()); return new Request("http://localhost/api/jobs/weekly-report", { method: "POST", body, headers: { "content-type": "application/json", "x-job-timestamp": timestamp, "x-job-signature": signHmacRequest({ secret, timestamp, rawBody: body }), "idempotency-key": key } }); }
  it("requires a valid signature and report period", async () => { expect((await POST(new Request("http://localhost/api/jobs/weekly-report", { method: "POST", body: "{}" }))).status).toBe(401); expect((await POST(request({ runId: "run-1", periodStart: "bad", periodEnd: "2026-07-13T00:00:00Z" }))).status).toBe(400); });
  it("claims, generates, sends, and completes one idempotent job", async () => { const response = await POST(request({ runId: "run-1", periodStart: "2026-07-06T00:00:00Z", periodEnd: "2026-07-13T00:00:00Z" })); expect(response.status).toBe(200); expect(generate.generateWeeklyReports).toHaveBeenCalledWith(expect.objectContaining({ periodStart: new Date("2026-07-06T00:00:00Z"), periodEnd: new Date("2026-07-13T00:00:00Z") })); expect(send.sendWeeklyReports).toHaveBeenCalledWith(expect.objectContaining({ generated: expect.any(Array) })); expect(jobs.updateJobRun).toHaveBeenCalledWith(expect.anything(), "job-1", expect.objectContaining({ state: "completed" })); });
  it("returns a completed result without resending", async () => { jobs.claimJobRun.mockResolvedValue({ claimed: false, run: { id: "job-1", state: "completed", result: { sent: 1 } } }); const response = await POST(request({ runId: "run-1", periodStart: "2026-07-06T00:00:00Z", periodEnd: "2026-07-13T00:00:00Z" })); expect(await response.json()).toEqual({ sent: 1 }); expect(send.sendWeeklyReports).not.toHaveBeenCalled(); });
  it("requires explicit ISO periods and a run-bound idempotency key", async () => {
    expect((await POST(request({ runId: "run-1", periodStart: 1783296000000, periodEnd: "2026-07-13T00:00:00Z" }))).status).toBe(400);
    expect((await POST(request({ runId: "run-1", periodStart: "July 6 2026", periodEnd: "2026-07-13T00:00:00Z" }))).status).toBe(400);
    expect((await POST(request({ runId: "run-1", periodStart: "2026-07-06T00:00:00Z", periodEnd: "2026-07-13T00:00:00Z" }, "weekly-report:another-run"))).status).toBe(400);
    expect(jobs.claimJobRun).not.toHaveBeenCalled();
  });
});