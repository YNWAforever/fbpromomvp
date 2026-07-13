import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBestTimeClient } from "./client";

describe("BestTime adapter", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts coverage and maps the matched provider venue and forecast", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          venue_info: { venue_id: "bt-123", venue_name: "Harbour Cafe", venue_address: "18 Queen's Road" },
          analysis: { venue_forecasted_busyness: [12, 24, 31] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = createBestTimeClient({
      baseUrl: "https://besttime.test/api/v1",
      privateKey: "private-secret",
      fetch: fetchMock,
    });

    await expect(client.checkCoverage({ name: "Harbour Cafe", address: "18 Queen's Road" })).resolves.toMatchObject({
      available: true,
      providerVenueId: "bt-123",
      matchedName: "Harbour Cafe",
      matchedAddress: "18 Queen's Road",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://besttime.test/api/v1/forecasts",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      venue_name: "Harbour Cafe",
      venue_address: "18 Queen's Road",
      api_key_private: "private-secret",
    });
  });

  it("maps missing live analysis to unavailable rather than a zero delta", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ analysis: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createBestTimeClient({
      baseUrl: "https://besttime.test/api/v1",
      privateKey: "private-secret",
      fetch: fetchMock,
    });

    await expect(client.getLive("bt-123")).resolves.toMatchObject({
      status: "unavailable",
      delta: null,
      forecastedBusyness: null,
      liveBusyness: null,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://besttime.test/api/v1/forecasts/live");
  });

  it("redacts provider keys from provider errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("upstream private-secret failed"));
    const client = createBestTimeClient({
      baseUrl: "https://besttime.test/api/v1",
      privateKey: "private-secret",
      publicKey: "public-secret",
      fetch: fetchMock,
    });

    await expect(client.getLive("bt-123")).rejects.toThrow("BestTime request failed");
    await expect(client.getLive("bt-123")).rejects.not.toThrow("private-secret");
    await expect(client.getLive("bt-123")).rejects.not.toThrow("public-secret");
  });

  it("returns an unavailable state without contacting BestTime when no live credentials exist", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createBestTimeClient({ baseUrl: "https://besttime.test/api/v1", privateKey: undefined, fetch: fetchMock });
    await expect(client.getLive("bt-123")).resolves.toMatchObject({ status: "unavailable", delta: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
