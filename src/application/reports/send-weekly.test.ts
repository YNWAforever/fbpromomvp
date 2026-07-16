import { describe, expect, it, vi } from "vitest";
import type { claimWeeklyReportDelivery, updateWeeklyReport } from "@/db/repositories/reports";
import { verifyScopedToken } from "@/lib/security/signed-token";
import { createWeeklyReportLinks, sendWeeklyReports, WEEKLY_REPORT_TOKEN_TTL_SECONDS } from "./send-weekly";

const secret = "abcdefghijklmnopqrstuvwxyz123456";

describe("weekly report delivery", () => {
  it("creates report links whose scoped token lasts exactly fourteen days", () => {
    const now = new Date("2026-07-13T00:00:00Z");
    const links = createWeeklyReportLinks({
      baseUrl: "https://example.test/",
      secret,
      reportId: "report-1",
      now,
    });
    const token = new URL(links.reportUrl).pathname.split("/").at(-1)!;

    expect(WEEKLY_REPORT_TOKEN_TTL_SECONDS).toBe(14 * 24 * 60 * 60);
    expect(links.imageUrl).toBe(links.reportUrl + "/image");
    expect(verifyScopedToken(token, secret, "weekly-report", new Date("2026-07-26T23:59:59Z"))).toMatchObject({
      subject: "report-1",
    });
    expect(verifyScopedToken(token, secret, "weekly-report", new Date("2026-07-27T00:00:00Z"))).toBeNull();
  });

  it("stores provider message ids and marks reports without an owner incomplete", async () => {
    const update = vi.fn(async (_db: unknown, id: string, values: Record<string, unknown>) => ({ id, ...values }));
    const provider = {
      sendReport: vi.fn(async () => ({ messageId: "provider-message-1" })),
    };
    const generated = [
      {
        venue: { id: "venue-1", name: "Harbour Cafe" },
        report: { id: "report-1", periodStart: "2026-07-06T00:00:00Z", periodEnd: "2026-07-13T00:00:00Z" },
        ownerMemberId: "owner-1",
      },
      {
        venue: { id: "venue-2", name: "Kowloon Cafe" },
        report: { id: "report-2", periodStart: "2026-07-06T00:00:00Z", periodEnd: "2026-07-13T00:00:00Z" },
      },
    ];

    const result = await sendWeeklyReports({
      db: {} as never,
      generated,
      provider,
      baseUrl: "https://example.test",
      secret,
      now: new Date("2026-07-13T00:00:00Z"),
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    });

    expect(result).toMatchObject({ total: 2, sent: 1, incomplete: 1 });
    expect(provider.sendReport).toHaveBeenCalledWith(expect.objectContaining({
      reportId: "report-1",
      memberId: "owner-1",
      reportUrl: expect.stringContaining("/reports/"),
      imageUrl: expect.stringContaining("/image"),
    }));
    expect(update).toHaveBeenNthCalledWith(1, expect.anything(), "report-1", { state: "sending" });
    expect(update).toHaveBeenNthCalledWith(2, expect.anything(), "report-1", {
      state: "sent",
      providerMessageId: "provider-message-1",
    });
    expect(update).toHaveBeenNthCalledWith(3, expect.anything(), "report-2", { state: "incomplete" });
  });

  it("does not send a report that already has a provider message id", async () => {
    const provider = { sendReport: vi.fn() };
    const update = vi.fn();

    const result = await sendWeeklyReports({
      db: {} as never,
      generated: [{
        venue: { id: "venue-1", name: "Harbour Cafe" },
        report: {
          id: "report-1",
          state: "sending",
          providerMessageId: "existing-message",
          periodStart: "2026-07-06T00:00:00Z",
          periodEnd: "2026-07-13T00:00:00Z",
        },
        ownerMemberId: "owner-1",
      }],
      provider,
      baseUrl: "https://example.test",
      secret,
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    });

    expect(result).toMatchObject({ total: 1, sent: 0, incomplete: 0, alreadySent: 1 });
    expect(provider.sendReport).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not resend after provider success when message-id persistence fails", async () => {
    let stored: Record<string, unknown> = {
      id: "report-1",
      state: "generated",
      periodStart: "2026-07-06T00:00:00Z",
      periodEnd: "2026-07-13T00:00:00Z",
    };
    let failSentUpdate = true;
    const claim = vi.fn(async () => {
      stored = { ...stored, state: "sending" };
      return stored;
    });
    const update = vi.fn(async (_db: unknown, _id: string, values: Record<string, unknown>) => {
      if (values.state === "sent" && failSentUpdate) {
        failSentUpdate = false;
        throw new Error("database unavailable after provider success");
      }
      stored = { ...stored, ...values };
      return stored;
    });
    const provider = { sendReport: vi.fn(async () => ({ messageId: "provider-message-1" })) };
    const delivery = {
      db: {} as never,
      provider,
      baseUrl: "https://example.test",
      secret,
      repositories: {
        claimWeeklyReportDelivery: claim as unknown as typeof claimWeeklyReportDelivery,
        updateWeeklyReport: update as unknown as typeof updateWeeklyReport,
      },
    };

    await expect(sendWeeklyReports({
      ...delivery,
      generated: [{
        venue: { id: "venue-1", name: "Harbour Cafe" },
        report: stored,
        ownerMemberId: "owner-1",
      }],
    })).rejects.toThrow("database unavailable");

    const retry = await sendWeeklyReports({
      ...delivery,
      generated: [{
        venue: { id: "venue-1", name: "Harbour Cafe" },
        report: stored,
        ownerMemberId: "owner-1",
      }],
    });

    expect(retry).toMatchObject({ total: 1, sent: 0, alreadySent: 0, uncertain: 1 });
    expect(provider.sendReport).toHaveBeenCalledTimes(1);
    expect(stored).toMatchObject({ state: "sending" });
  });

  it("releases the claim for a definitely-unsent provider rejection", async () => {
    let stored: Record<string, unknown> = {
      id: "report-1",
      state: "generated",
      periodStart: "2026-07-06T00:00:00Z",
      periodEnd: "2026-07-13T00:00:00Z",
    };
    const update = vi.fn(async (_db: unknown, _id: string, values: Record<string, unknown>) => {
      stored = { ...stored, ...values };
      return stored;
    });
    const provider = {
      sendReport: vi.fn(async () => {
        const error = new Error("preview audience isolation");
        Object.assign(error, { code: "audience_isolation" });
        throw error;
      }),
    };

    await expect(sendWeeklyReports({
      db: {} as never,
      generated: [{
        venue: { id: "venue-1", name: "Harbour Cafe" },
        report: stored,
        ownerMemberId: "owner-1",
      }],
      provider,
      baseUrl: "https://example.test",
      secret,
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    })).rejects.toThrow("preview audience isolation");

    expect(stored).toMatchObject({ state: "failed" });
    expect(update).toHaveBeenNthCalledWith(1, expect.anything(), "report-1", { state: "sending" });
    expect(update).toHaveBeenNthCalledWith(2, expect.anything(), "report-1", { state: "failed" });
  });

  it("keeps ambiguous provider responses in sending for reconciliation", async () => {
    let stored: Record<string, unknown> = {
      id: "report-1",
      state: "generated",
      periodStart: "2026-07-06T00:00:00Z",
      periodEnd: "2026-07-13T00:00:00Z",
    };
    const update = vi.fn(async (_db: unknown, _id: string, values: Record<string, unknown>) => {
      stored = { ...stored, ...values };
      return stored;
    });
    const provider = {
      sendReport: vi.fn(async () => {
        const error = new Error("provider rate limit");
        Object.assign(error, { code: "http_429" });
        throw error;
      }),
    };

    await expect(sendWeeklyReports({
      db: {} as never,
      generated: [{
        venue: { id: "venue-1", name: "Harbour Cafe" },
        report: stored,
        ownerMemberId: "owner-1",
      }],
      provider,
      baseUrl: "https://example.test",
      secret,
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    })).rejects.toThrow("provider rate limit");

    expect(stored).toMatchObject({ state: "sending" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.anything(), "report-1", { state: "sending" });
  });
});