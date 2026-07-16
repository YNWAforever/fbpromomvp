import { describe, expect, it, vi } from "vitest";
import { WozTellIsolationError } from "./bot-client";
import { createWozTellReportClient } from "./report-client";

const message = {
  reportId: "report-1",
  venueId: "venue-1",
  venueName: "Harbour Cafe",
  memberId: "owner-1",
  periodStart: "2026-07-06T00:00:00.000Z",
  periodEnd: "2026-07-13T00:00:00.000Z",
  reportUrl: "https://example.test/reports/token",
  imageUrl: "https://example.test/reports/token/image",
};

describe("WozTell weekly report adapter", () => {
  it("fails closed for preview sends without a Priority Group", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createWozTellReportClient({
      baseUrl: "https://bot.woztell.test",
      accessToken: "woz-token",
      channelId: "test-channel",
      environmentId: "test-environment",
      treeId: "test-tree",
      nodeId: "test-node",
      nonProductionAudienceIds: ["test-channel", "test-environment", "test-tree", "test-node"],
      runtimeEnvironment: "preview",
      fetch: fetchMock,
    });

    await expect(client.sendReport(message)).rejects.toBeInstanceOf(WozTellIsolationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends through an explicitly allowed preview Priority Group", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ messageId: "report-message-1" }), { status: 200 }));
    const client = createWozTellReportClient({
      baseUrl: "https://bot.woztell.test",
      accessToken: "woz-token",
      channelId: "test-channel",
      environmentId: "test-environment",
      treeId: "test-tree",
      nodeId: "test-node",
      priorityGroupId: "test-priority",
      nonProductionAudiencePrefix: "test-",
      runtimeEnvironment: "preview",
      fetch: fetchMock,
    });

    await expect(client.sendReport(message)).resolves.toEqual({ messageId: "report-message-1" });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      priorityGroupId: "test-priority",
      meta: {
        reportId: "report-1",
        reportUrl: message.reportUrl,
        imageUrl: message.imageUrl,
      },
    });
  });
});