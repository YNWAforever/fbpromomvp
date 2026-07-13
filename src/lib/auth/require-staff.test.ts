import { describe, expect, it } from "vitest";
import { authorizeStaff } from "./require-staff";

describe("authorizeStaff", () => {
  const staff = { id: "staff-1", email: "ops@example.com", name: "Ops" };

  it("rejects an allowlisted email when no active staff row exists", async () => {
    await expect(
      authorizeStaff("ops@example.com", ["ops@example.com"], async () => null),
    ).rejects.toThrow("Staff access denied");
  });

  it("returns the active staff identity for an allowlisted email", async () => {
    await expect(
      authorizeStaff("ops@example.com", ["ops@example.com"], async () => staff),
    ).resolves.toEqual(staff);
  });

  it("normalizes email and allowlist values before checking access", async () => {
    await expect(
      authorizeStaff(" OPS@EXAMPLE.COM ", ["ops@example.com"], async () => staff),
    ).resolves.toEqual(staff);
  });

  it("rejects emails outside the allowlist without looking up a staff row", async () => {
    const findStaff = async () => {
      throw new Error("staff lookup should not run");
    };

    await expect(
      authorizeStaff("intruder@example.com", ["ops@example.com"], findStaff),
    ).rejects.toThrow("Staff access denied");
  });
});
