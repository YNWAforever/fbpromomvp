import { describe, expect, it } from "vitest";
import { signHmacRequest, verifyHmacRequest } from "./hmac";

describe("timestamped n8n HMAC", () => {
  const secret = "12345678901234567890123456789012";
  const timestamp = "1784020800000";
  const rawBody = JSON.stringify({ runId: "run-1", scheduledAt: "2026-07-14T04:00:00.000Z" });

  it("verifies an unmodified, fresh request", () => {
    const signature = signHmacRequest({ secret, timestamp, rawBody });
    expect(verifyHmacRequest({ secret, timestamp, signature, rawBody, now: Number(timestamp) })).toBe(true);
    expect(verifyHmacRequest({ secret, timestamp, signature: `sha256=${signature}`, rawBody, now: Number(timestamp) })).toBe(true);
  });

  it("rejects changed bodies, bad signatures, and replayed timestamps", () => {
    const signature = signHmacRequest({ secret, timestamp, rawBody });
    expect(verifyHmacRequest({ secret, timestamp, signature, rawBody: `${rawBody} `, now: Number(timestamp) })).toBe(false);
    expect(verifyHmacRequest({ secret, timestamp, signature: signature.slice(0, -1), rawBody, now: Number(timestamp) })).toBe(false);
    expect(verifyHmacRequest({ secret, timestamp, signature, rawBody, now: Number(timestamp) + 301_000 })).toBe(false);
  });
});

