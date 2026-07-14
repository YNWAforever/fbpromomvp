import { describe, expect, it, vi } from "vitest";
import { createOpenCodeGoClient } from "./client";
import type { CopyInput } from "@/domain/copy/types";

const input: CopyInput = {
  venueName: "Harbour Cafe",
  facts: { headline: "靜市優惠", benefit: "消費滿 HK$100 即減 HK$20", conditions: ["今日有效"] },
  expiresAt: "17:00",
  tone: "親切",
  triggerContext: { currentDelta: -25 },
};

describe("OpenCode Go copy adapter", () => {
  it("posts grounded campaign context and validates structured model output", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [
        { body: "靜市優惠：消費滿 HK$100 即減 HK$20，今日有效。" },
        { body: "Harbour Cafe：消費滿 HK$100 即減 HK$20，今日有效。" },
        { body: "歡迎到店：消費滿 HK$100 即減 HK$20，今日有效。" },
      ] }) } }] }), { status: 200 }),
    );
    const client = createOpenCodeGoClient({ baseUrl: "https://opencode.test/v1", apiKey: "secret-key", model: "test-model", fetch: fetchMock });
    const candidates = await client.generate(input);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.valid && candidate.source === "model")).toBe(true);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://opencode.test/v1/chat/completions");
    expect(request?.headers).toMatchObject({ authorization: "Bearer secret-key" });
    expect(JSON.parse(String(request?.body))).toMatchObject({ model: "test-model", temperature: 0.4 });
    expect(String(request?.body)).toContain("currentDelta");
  });

  it("fills invalid model outputs from deterministic fallbacks and redacts keys", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("upstream secret-key failed"));
    const client = createOpenCodeGoClient({ baseUrl: "https://opencode.test/v1", apiKey: "secret-key", fetch: fetchMock });
    await expect(client.generate(input)).resolves.toHaveLength(3);
    await expect(client.generate(input)).resolves.not.toThrow("secret-key");
  });

  it("aborts a hanging provider request at the configured timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted", "AbortError")));
      }));
      const client = createOpenCodeGoClient({ baseUrl: "https://opencode.test/v1", apiKey: "secret-key", timeoutMs: 1_000, fetch: fetchMock });
      const pending = client.generate(input);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
