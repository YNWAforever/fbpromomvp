import { describe, expect, it } from "vitest";
import { assertSameVenue } from "./ownership";

describe("database ownership guard", () => {
  it("rejects records that cross venue boundaries", () => {
    expect(() => assertSameVenue("trigger", "venue-a", "venue-b")).toThrow(
      "trigger must belong to venue venue-a",
    );
  });

  it("accepts matching venue IDs", () => {
    expect(assertSameVenue("trigger", "venue-a", "venue-a")).toBeUndefined();
  });
});