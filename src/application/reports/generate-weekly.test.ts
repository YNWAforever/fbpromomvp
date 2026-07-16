import { describe, expect, it, vi } from "vitest";
import type { updateWeeklyReport } from "@/db/repositories/reports";
import { generateWeeklyReports, type GenerateWeeklyRepositories } from "./generate-weekly";
import { sendWeeklyReports } from "./send-weekly";

describe("weekly report retry", () => {
  it("preserves a sent report and does not deliver it twice", async () => {
    const existing = {
      id: "report-1",
      venueId: "venue-1",
      periodStart: new Date("2026-07-06T00:00:00Z"),
      periodEnd: new Date("2026-07-13T00:00:00Z"),
      state: "sent",
      providerMessageId: "existing-message",
      metrics: {},
      chartPoints: [],
    };
    const update = vi.fn(async (_db: unknown, _id: string, values: Record<string, unknown>) => ({ ...existing, ...values }));
    const repositories = {
      listActiveVenues: vi.fn(async () => [{ id: "venue-1", name: "Harbour Cafe", averageOrderValue: 80 }]),
      listReadings: vi.fn(async () => []),
      listTriggers: vi.fn(async () => []),
      listApprovals: vi.fn(async () => []),
      listPromotions: vi.fn(async () => []),
      listRedemptions: vi.fn(async () => []),
      listVenueIntegrations: vi.fn(async () => [{ provider: "woztell", metadata: { ownerReference: "owner-1" } }]),
      findWeeklyReport: vi.fn(async () => existing),
      createWeeklyReport: vi.fn(),
      updateWeeklyReport: update,
    } as unknown as Partial<GenerateWeeklyRepositories>;

    const generated = await generateWeeklyReports({
      db: {} as never,
      periodStart: new Date("2026-07-06T00:00:00Z"),
      periodEnd: new Date("2026-07-13T00:00:00Z"),
      repositories,
    });
    expect(generated[0]?.report).toMatchObject({ state: "sent", providerMessageId: "existing-message" });

    const provider = { sendReport: vi.fn() };
    const result = await sendWeeklyReports({
      db: {} as never,
      generated,
      provider,
      baseUrl: "https://example.test",
      secret: "abcdefghijklmnopqrstuvwxyz123456",
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    });

    expect(result).toMatchObject({ total: 1, sent: 0, incomplete: 0, alreadySent: 1 });
    expect(provider.sendReport).not.toHaveBeenCalled();
  });

  it("regenerates every active venue while sending only the unfinished report", async () => {
    const periodStart = new Date("2026-07-06T00:00:00Z");
    const periodEnd = new Date("2026-07-13T00:00:00Z");
    const sentReport = {
      id: "report-1",
      venueId: "venue-1",
      periodStart,
      periodEnd,
      state: "sent",
      providerMessageId: "existing-message",
      metrics: {},
      chartPoints: [],
    };
    const update = vi.fn(async (_db: unknown, id: string, values: Record<string, unknown>) => ({
      ...(id === "report-1" ? sentReport : { id }),
      ...values,
    }));
    const repositories = {
      listActiveVenues: vi.fn(async () => [
        { id: "venue-1", name: "Harbour Cafe", averageOrderValue: 80 },
        { id: "venue-2", name: "Kowloon Cafe", averageOrderValue: 90 },
      ]),
      listReadings: vi.fn(async () => []),
      listTriggers: vi.fn(async () => []),
      listApprovals: vi.fn(async () => []),
      listPromotions: vi.fn(async () => []),
      listRedemptions: vi.fn(async () => []),
      listVenueIntegrations: vi.fn(async (_db: unknown, venueId: string) => [{
        provider: "woztell",
        metadata: { ownerReference: "owner-" + venueId },
      }]),
      findWeeklyReport: vi.fn(async (_db: unknown, venueId: string) => venueId === "venue-1" ? sentReport : null),
      createWeeklyReport: vi.fn(async (_db: unknown, values: Record<string, unknown>) => ({
        id: "report-2",
        ...values,
      })),
      updateWeeklyReport: update,
    } as unknown as Partial<GenerateWeeklyRepositories>;

    const generated = await generateWeeklyReports({
      db: {} as never,
      periodStart,
      periodEnd,
      repositories,
    });
    expect(generated).toHaveLength(2);

    const provider = { sendReport: vi.fn(async () => ({ messageId: "new-message" })) };
    const result = await sendWeeklyReports({
      db: {} as never,
      generated,
      provider,
      baseUrl: "https://example.test",
      secret: "abcdefghijklmnopqrstuvwxyz123456",
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    });

    expect(result).toMatchObject({ total: 2, sent: 1, alreadySent: 1 });
    expect(provider.sendReport).toHaveBeenCalledTimes(1);
    expect(provider.sendReport).toHaveBeenCalledWith(expect.objectContaining({ reportId: "report-2", venueId: "venue-2" }));
  });

  it("preserves an uncertain sending claim during regeneration", async () => {
    const existing = {
      id: "report-1",
      venueId: "venue-1",
      periodStart: new Date("2026-07-06T00:00:00Z"),
      periodEnd: new Date("2026-07-13T00:00:00Z"),
      state: "sending",
      providerMessageId: null,
      metrics: {},
      chartPoints: [],
    };
    const update = vi.fn(async (_db: unknown, _id: string, values: Record<string, unknown>) => ({ ...existing, ...values }));
    const repositories = {
      listActiveVenues: vi.fn(async () => [{ id: "venue-1", name: "Harbour Cafe", averageOrderValue: 80 }]),
      listReadings: vi.fn(async () => []),
      listTriggers: vi.fn(async () => []),
      listApprovals: vi.fn(async () => []),
      listPromotions: vi.fn(async () => []),
      listRedemptions: vi.fn(async () => []),
      listVenueIntegrations: vi.fn(async () => [{ provider: "woztell", metadata: { ownerReference: "owner-1" } }]),
      findWeeklyReport: vi.fn(async () => existing),
      createWeeklyReport: vi.fn(),
      updateWeeklyReport: update,
    } as unknown as Partial<GenerateWeeklyRepositories>;

    const generated = await generateWeeklyReports({
      db: {} as never,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      repositories,
    });
    expect(generated[0]?.report).toMatchObject({ state: "sending", providerMessageId: null });

    const provider = { sendReport: vi.fn() };
    const result = await sendWeeklyReports({
      db: {} as never,
      generated,
      provider,
      baseUrl: "https://example.test",
      secret: "abcdefghijklmnopqrstuvwxyz123456",
      repositories: { updateWeeklyReport: update as unknown as typeof updateWeeklyReport },
    });
    expect(result).toMatchObject({ total: 1, sent: 0, uncertain: 1 });
    expect(provider.sendReport).not.toHaveBeenCalled();
  });
});