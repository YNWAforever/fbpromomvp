import { describe, expect, it } from "vitest";
import { canRetryPromotion, transitionPromotion } from "./transitions";

describe("promotion transitions", () => {
  it("allows queued to sending and accepted, but never counts failures", () => {
    expect(transitionPromotion({ state: "queued", event: "send" })).toEqual({ next: "sending" });
    expect(transitionPromotion({ state: "sending", event: "accepted" })).toEqual({ next: "accepted" });
    expect(transitionPromotion({ state: "sending", event: "failed" })).toEqual({ next: "send_failed" });
    expect(canRetryPromotion("send_failed", 2)).toBe(true);
    expect(canRetryPromotion("accepted", 0)).toBe(false);
  });
  it("stops retries after three failures and rejects cancellation retries", () => {
    expect(canRetryPromotion("send_failed", 3)).toBe(false);
    expect(canRetryPromotion("cancelled", 0)).toBe(false);
  });
});
