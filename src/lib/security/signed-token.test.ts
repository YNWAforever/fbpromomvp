import { describe, expect, it } from "vitest";
import { signScopedApprovalToken, signScopedToken, verifyScopedApprovalToken, verifyScopedToken } from "./signed-token";

describe("scoped owner approval links", () => {
  it("requires the original venue and approval scope and expires", () => {
    const secret = "owner-link-secret";
    const token = signScopedApprovalToken({ venueId: "venue-1", approvalId: "approval-1", exp: 1_790_000_000 }, secret);
    expect(verifyScopedApprovalToken(token, secret, new Date("2026-07-14T00:00:00.000Z"))).toMatchObject({ venueId: "venue-1", approvalId: "approval-1" });
    expect(verifyScopedApprovalToken(`${token}x`, secret)).toBeNull();
    expect(verifyScopedApprovalToken(token, "wrong-secret")).toBeNull();
    expect(verifyScopedApprovalToken(token, secret, new Date("2027-01-01T00:00:00.000Z"))).toBeNull();
  });
});
describe("generic scoped tokens", () => {
  it("signs versioned promotion tokens and rejects tampering, expiry, and wrong scope", () => {
    const secret = "redemption-secret";
    const token = signScopedToken({ scope: "promotion", subject: "promotion-1", exp: 1_790_000_000 }, secret);
    expect(verifyScopedToken(token, secret, "promotion", new Date("2026-07-14T00:00:00.000Z"))).toMatchObject({ scope: "promotion", subject: "promotion-1" });
    expect(verifyScopedToken(token, secret, "report")).toBeNull();
    expect(verifyScopedToken(`${token}x`, secret, "promotion")).toBeNull();
    expect(verifyScopedToken(token, "wrong-secret", "promotion")).toBeNull();
    expect(verifyScopedToken(token, secret, "promotion", new Date("2027-01-01T00:00:00.000Z"))).toBeNull();
  });
});