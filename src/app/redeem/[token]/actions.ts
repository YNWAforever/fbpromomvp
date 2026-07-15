"use server";

import { env } from "@/env";
import { withDatabase } from "@/db/client";
import { submitRedemption } from "@/application/redemptions/submit-redemption";

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

export async function submitRedemptionAction(formData: FormData) {
  const token = value(formData, "token");
  const countValue = value(formData, "count");
  const note = value(formData, "note") || null;
  const count = Number(countValue);
  if (!token || !countValue || !Number.isInteger(count)) return { ok: false, error: "Enter a whole-number redemption count." };
  try {
    const result = await withDatabase((db) => submitRedemption({ db, token, secret: env.OWNER_LINK_SECRET, count, note }));
    return { ok: true, report: { count: result.count, revision: result.revision } };
  } catch {
    return { ok: false, error: "Unable to save redemption count." };
  }
}
