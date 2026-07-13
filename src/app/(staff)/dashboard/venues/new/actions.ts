"use server";

import { createBestTimeClient } from "@/integrations/besttime/client";
import { normalizeBusinessHours } from "@/domain/venues/activation";
import { withDatabase } from "@/db/client";
import { createVenueIdempotent, upsertVenueIntegration } from "@/db/repositories/venues";
import { requireStaff } from "@/lib/auth/require-staff";
import { checkVenueCoverage } from "@/application/venues/check-coverage";
import { confirmMatch } from "@/application/venues/confirm-match";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function businessHours(formData: FormData): Record<string, unknown> {
  const raw = text(formData, "businessHours");
  if (!raw) return {};
  try {
    return normalizeBusinessHours(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function createDraftVenueAction(formData: FormData) {
  await requireStaff();
  const name = text(formData, "name");
  const address = text(formData, "address");
  const category = text(formData, "category");
  const requestKey = text(formData, "requestKey");
  if (!name || !address || !category) return { ok: false, error: "Name, address, and category are required." };
  if (!requestKey) return { ok: false, error: "A request key is required; please retry from the onboarding form." };
  return withDatabase((db) => db.transaction(async (tx) => {
    const { venue, created } = await createVenueIdempotent(tx, {
      idempotencyKey: requestKey,
      name,
      address,
      category,
      timezone: text(formData, "timezone") || "Asia/Hong_Kong",
      status: "draft",
      businessHours: businessHours(formData),
    });
    if (!venue?.id) return { ok: false, error: "Unable to create draft venue." };
    if (!created) return { ok: true, venueId: venue.id, submitted: { name: venue.name, address: venue.address } };
    await upsertVenueIntegration(tx, {
      venueId: venue.id,
      provider: "woztell",
      metadata: { ownerReference: text(formData, "ownerReference"), channelReference: text(formData, "channelReference"), audienceReference: text(formData, "audienceReference") },
    });
    return { ok: true, venueId: venue.id, submitted: { name, address } };
  }));
}
export async function checkVenueCoverageAction(formData: FormData) {
  await requireStaff();
  const venueId = text(formData, "venueId");
  if (!venueId) return { ok: false, error: "Venue is required." };
  const provider = createBestTimeClient();
  const requestKey = text(formData, "requestKey");
  return withDatabase(async (db) => ({ ok: true, ...(await checkVenueCoverage({ db, provider, venueId, requestKey: requestKey || undefined })) }));
}

export async function confirmVenueMatchAction(formData: FormData) {
  const staff = await requireStaff();
  const venueId = text(formData, "venueId");
  if (!venueId) return { ok: false, error: "Venue is required." };
  return withDatabase((db) => db.transaction(async (tx) => ({
    ok: true,
    ...(await confirmMatch({ db: tx, venueId, staff, confirmed: text(formData, "confirmed") === "true" })),
  })));
}

export const createVenueAction = createDraftVenueAction;
export const checkCoverageAction = checkVenueCoverageAction;
export const confirmMatchAction = confirmVenueMatchAction;

export async function createDraftVenueFormAction(formData: FormData) { return createDraftVenueAction(formData); }

export async function checkVenueCoverageFormAction(formData: FormData) { return checkVenueCoverageAction(formData); }

export async function confirmVenueMatchFormAction(formData: FormData) { return confirmVenueMatchAction(formData); }