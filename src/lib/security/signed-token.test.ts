import { describe, expect, it } from "vitest";
import { signScopedApprovalToken, verifyScopedApprovalToken } from "./signed-token";

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


