import { describe, expect, it } from "vitest";
import { resolveApproval } from "./resolve";

describe("resolveApproval", () => {
  const now = new Date("2026-07-12T07:00:00.000Z");
  const expiresAt = new Date("2026-07-12T07:15:00.000Z");

  it("approves a pending approval and expires after the deadline", () => {
    expect(resolveApproval({ state: "pending", now, expiresAt, action: "approve" })).toEqual({ next: "approved" });
    expect(resolveApproval({ state: "pending", now: new Date("2026-07-12T07:16:00.000Z"), expiresAt, action: "approve" })).toEqual({ next: "expired" });
  });

  it("does not mutate terminal states", () => {
    expect(resolveApproval({ state: "approved", now, expiresAt, action: "approve" })).toEqual({ next: "unchanged" });
    expect(resolveApproval({ state: "skipped", now, expiresAt, action: "approve" })).toEqual({ next: "unchanged" });
  });

  it("supports select/edit/skip transitions", () => {
    expect(resolveApproval({ state: "pending", now, expiresAt, action: "select" })).toEqual({ next: "selected" });
    expect(resolveApproval({ state: "selected", now, expiresAt, action: "edit" })).toEqual({ next: "edited" });
    expect(resolveApproval({ state: "edited", now, expiresAt, action: "skip" })).toEqual({ next: "skipped" });
  });
});
