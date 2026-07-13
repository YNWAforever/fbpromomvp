"use server";

import { createBestTimeClient } from "@/integrations/besttime/client";
import { normalizeBusinessHours } from "@/domain/venues/activation";
import { withDatabase } from "@/db/client";
import { createVenue, upsertVenueIntegration } from "@/db/repositories/venues";
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
  if (!name || !address || !category) return { ok: false, error: "Name, address, and category are required." };
  const venue = await withDatabase((db) =>
    createVenue(db, {
      name,
      address,
      category,
      timezone: text(formData, "timezone") || "Asia/Hong_Kong",
      status: "draft",
      businessHours: businessHours(formData),
    }),
  );
  if (venue?.id) {
    await withDatabase((db) => upsertVenueIntegration(db, {
      venueId: venue.id,
      provider: "woztell",
      metadata: { ownerReference: text(formData, "ownerReference"), channelReference: text(formData, "channelReference"), audienceReference: text(formData, "audienceReference") },
    }));
  }
  return { ok: true, venueId: venue?.id };
}

export async function checkVenueCoverageAction(formData: FormData) {
  await requireStaff();
  const venueId = text(formData, "venueId");
  if (!venueId) return { ok: false, error: "Venue is required." };
  const provider = createBestTimeClient();
  return withDatabase(async (db) => ({ ok: true, ...(await checkVenueCoverage({ db, provider, venueId })) }));
}

export async function confirmVenueMatchAction(formData: FormData) {
  const staff = await requireStaff();
  const venueId = text(formData, "venueId");
  if (!venueId) return { ok: false, error: "Venue is required." };
  return withDatabase(async (db) => ({
    ok: true,
    ...(await confirmMatch({ db, venueId, staff, confirmed: text(formData, "confirmed") === "true" })),
  }));
}

export const createVenueAction = createDraftVenueAction;
export const checkCoverageAction = checkVenueCoverageAction;
export const confirmMatchAction = confirmVenueMatchAction;

export async function createDraftVenueFormAction(formData: FormData): Promise<void> {
  await createDraftVenueAction(formData);
}

export async function checkVenueCoverageFormAction(formData: FormData): Promise<void> {
  await checkVenueCoverageAction(formData);
}

export async function confirmVenueMatchFormAction(formData: FormData): Promise<void> {
  await confirmVenueMatchAction(formData);
}