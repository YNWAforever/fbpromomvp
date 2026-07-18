import { describe, expect, it } from "vitest";
import { nextRedemptionRevision, resolveConcurrentFirstRedemption } from "./reports";

describe("redemption revision guard", () => {
  it("starts at revision one and increments only when values change", () => {
    expect(nextRedemptionRevision(undefined, { count: 4, note: "first" })).toEqual({ changed: true, revision: 1 });
    expect(nextRedemptionRevision({ count: 4, note: "first", revision: 1 }, { count: 4, note: "first", revision: 99 })).toEqual({
      changed: false,
      revision: 1,
    });
    expect(nextRedemptionRevision({ count: 4, note: "first", revision: 1 }, { count: 8, note: "corrected", revision: 2 })).toEqual({
      changed: true,
      revision: 2,
    });
  });

  it("rejects stale or skipped revisions for changed values", () => {
    expect(() => nextRedemptionRevision({ count: 4, note: null, revision: 2 }, { count: 8, note: null, revision: 2 })).toThrow(
      "revision must advance monotonically",
    );
  });

  it("rejects a concurrent first report whose authoritative values differ", () => {
    const raced = { count: 8, note: "first writer", revision: 1 };
    expect(() => resolveConcurrentFirstRedemption(raced, { count: 9, note: "second writer", revision: 1 }))
      .toThrow("changed concurrently");
    expect(resolveConcurrentFirstRedemption(raced, { count: 8, note: "first writer", revision: 1 }))
      .toBe(raced);
  });
});
