import { describe, expect, it, vi } from "vitest";
import { WozTellIsolationError, createWozTellBotClient } from "./bot-client";

const message = {
  approvalId: "approval-1",
  venueId: "venue-1",
  memberId: "member-secret",
  expiresAt: "2026-07-14T10:15:00.000Z",
  candidates: [
    { id: "candidate-1", body: "消費滿 HK$100 即減 HK$20。" },
    { id: "candidate-2", body: "Harbour Cafe：消費滿 HK$100 即減 HK$20。" },
    { id: "candidate-3", body: "今日靜市：消費滿 HK$100 即減 HK$20。" },
  ],
};

describe("WozTell Bot approval adapter", () => {
  it("redirects only through the configured Priority Group in preview", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ messageId: "woz-msg-1" }), { status: 200 }));
    const client = createWozTellBotClient({
      baseUrl: "https://bot.woztell.test",
      accessToken: "woz-token",
      channelId: "channel-1",
      environmentId: "test-environment",
      treeId: "tree-1",
      nodeId: "node-1",
      priorityGroupId: "priority-1",
      runtimeEnvironment: "preview",
      fetch: fetchMock,
    });
    await expect(client.sendApproval(message)).resolves.toEqual({ messageId: "woz-msg-1" });
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://bot.woztell.test/redirectMemberToNode?accessToken=woz-token");
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({ channel: "channel-1", member: "member-secret", environment: "test-environment", tree: "tree-1", node: "node-1", priorityGroupId: "priority-1", executeActions: true, executeConditions: true, executeRules: true });
    expect(body.meta).toMatchObject({ approvalId: "approval-1", venueId: "venue-1", expiresAt: message.expiresAt });
  });

  it("fails closed for preview sends without a Priority Group", async () => {
    const client = createWozTellBotClient({ baseUrl: "https://bot.woztell.test", accessToken: "woz-token", channelId: "channel-1", treeId: "tree-1", nodeId: "node-1", runtimeEnvironment: "preview", fetch: vi.fn() });
    await expect(client.sendApproval(message)).rejects.toBeInstanceOf(WozTellIsolationError);
  });

  it("fails closed when preview/test is pointed at production audience IDs", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createWozTellBotClient({
      baseUrl: "https://bot.woztell.test",
      accessToken: "woz-token",
      channelId: "prod-channel",
      environmentId: "prod-environment",
      treeId: "prod-tree",
      nodeId: "prod-node",
      priorityGroupId: "prod-priority",
      runtimeEnvironment: "preview",
      fetch: fetchMock,
    });
    await expect(client.sendApproval(message)).rejects.toBeInstanceOf(WozTellIsolationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a non-production environment as well as a Priority Group", async () => {
    const client = createWozTellBotClient({
      baseUrl: "https://bot.woztell.test",
      accessToken: "woz-token",
      channelId: "channel-1",
      treeId: "tree-1",
      nodeId: "node-1",
      priorityGroupId: "priority-1",
      runtimeEnvironment: "test",
      fetch: vi.fn(),
    });
    await expect(client.sendApproval(message)).rejects.toBeInstanceOf(WozTellIsolationError);
  });
  it("redacts token and member IDs from provider errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("woz-token member-secret failed"));
    const client = createWozTellBotClient({ baseUrl: "https://bot.woztell.test", accessToken: "woz-token", channelId: "channel-1", treeId: "tree-1", nodeId: "node-1", priorityGroupId: "priority-1", runtimeEnvironment: "test", fetch: fetchMock });
    await expect(client.sendApproval(message)).rejects.not.toThrow("woz-token");
    await expect(client.sendApproval(message)).rejects.not.toThrow("member-secret");
  });
});
