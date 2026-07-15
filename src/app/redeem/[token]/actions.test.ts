import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const redemptions = vi.hoisted(() => ({ submitRedemption: vi.fn() }));
const secrets = vi.hoisted(() => ({ env: { OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456" } }));
vi.mock("@/db/client", () => db);
vi.mock("@/application/redemptions/submit-redemption", () => redemptions);
vi.mock("@/env", () => secrets);

import { submitRedemptionAction } from "./actions";

describe("submitRedemptionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.withDatabase.mockImplementation(async (work: (executor: unknown) => Promise<unknown>) => work({}));
  });

  it("rejects a missing or blank count before numeric conversion", async () => {
    const form = new FormData();
    form.set("token", "signed-token");
    form.set("count", "   ");

    await expect(submitRedemptionAction(form)).resolves.toEqual({ ok: false, error: "Enter a whole-number redemption count." });
    expect(db.withDatabase).not.toHaveBeenCalled();
    expect(redemptions.submitRedemption).not.toHaveBeenCalled();
  });

  it("returns a generic public error when persistence fails", async () => {
    redemptions.submitRedemption.mockRejectedValue(new Error("duplicate key value violates unique constraint audit_events_pkey"));
    const form = new FormData();
    form.set("token", "signed-token");
    form.set("count", "4");

    await expect(submitRedemptionAction(form)).resolves.toEqual({ ok: false, error: "Unable to save redemption count." });
  });
});
