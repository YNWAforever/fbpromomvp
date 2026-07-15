import { describe, expect, it, vi } from "vitest";
import { createWozTellOpenApiClient } from "./open-api-client";

describe("WozTell Open API client", () => {
  it("posts a GraphQL broadcast with a stable promotion mutation key", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { createBroadcast: {
      clientMutationId: "promotion-1", broadcast: { id: "broadcast-1", memberCount: 12, sentCount: 12, sent: true },
    } } }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createWozTellOpenApiClient({ fetch, accessToken: "test-token", appId: "app", channelId: "channel", runtimeEnvironment: "production" });
    const result = await client.createBroadcast({ promotionId: "promotion-1", audienceId: "audience", name: "Offer", messages: { body: "hello" }, scheduleAt: 123 });
    expect(result).toMatchObject({ broadcastId: "broadcast-1", memberCount: 12, sentCount: 12 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v3"), expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer test-token" }) }));
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(request.variables.input.clientMutationId).toBe("promotion-1");
    expect(request.query).toContain("createBroadcast");
  });

  it("rejects a preview audience without an explicit non-production allowlist", async () => {
    const client = createWozTellOpenApiClient({ fetch: vi.fn(), accessToken: "test-token", appId: "app", channelId: "channel", runtimeEnvironment: "preview" });
    await expect(client.createBroadcast({ promotionId: "promotion-1", audienceId: "production-audience", name: "Offer", messages: {}, scheduleAt: 123 })).rejects.toMatchObject({ code: "audience_isolation" });
  });
});
