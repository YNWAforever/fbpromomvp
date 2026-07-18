import { describe, expect, it } from "vitest";
import { normalizeVenueText, scoreVenueMatch } from "./match";

describe("venue match scoring", () => {
  it("blocks a low-confidence known case before activation", () => {
    expect(
      scoreVenueMatch(
        { name: "?雓??蹎抆??", address: "???????18??" },
        { name: "???雓???撒?", address: "???????20??" },
      ).decision,
    ).toBe("blocked");
  });

  it("normalizes compatibility characters, case, punctuation, spaces, and legal suffixes", () => {
    expect(normalizeVenueText(" ＡＢＣ Café, Limited  ")).toBe("abccafé");
    expect(normalizeVenueText("香港有限公司")).toBe("香港");
  });

  it("keeps strong matches in manual review instead of activating automatically", () => {
    const result = scoreVenueMatch(
      { name: "Harbour Cafe", address: "18 Queen's Road, Central" },
      { name: "Harbour Cafe Ltd", address: "18 Queens Road Central" },
    );

    expect(result.decision).toBe("manual_review");
    expect(result.totalScore).toBeGreaterThanOrEqual(0.72);
    expect(result.nameScore).toBeGreaterThanOrEqual(0.55);
    expect(result.addressScore).toBeGreaterThanOrEqual(0.6);
  });

  it("normalizes trailing legal punctuation deterministically", () => {
    expect(normalizeVenueText("Cafe Ltd.")).toBe(normalizeVenueText("Cafe"));
    expect(normalizeVenueText("İSTANBUL CAFE")).toBe("i̇stanbulcafe");
  });});
