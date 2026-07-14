import { getLatestForecastSnapshot, listActiveOfferTemplates, listVenueIntegrations, upsertVenueIntegration, findVenueById } from "@/db/repositories/venues";
import type { DatabaseExecutor } from "@/db/client";
import { assertSameVenue } from "@/db/repositories/ownership";
import type { StaffIdentity } from "@/lib/auth/require-staff";
import { scoreVenueMatch } from "@/domain/venues/match";
import { canActivateVenue } from "@/domain/venues/activation";
import { appendAuditEvent } from "@/db/repositories/audit";

export type ConfirmMatchInput = {
  db: DatabaseExecutor;
  venueId: string;
  staff: StaffIdentity;
  confirmed: boolean;
  snapshot?: {
    id?: string;
    venueId: string;
    providerVenueId: string | null;
    matchedName: string | null;
    matchedAddress: string | null;
    matchScore: number | null;
    payload?: Record<string, unknown>;
    fetchedAt?: Date;
    expiresAt?: Date;
  };
  now?: Date;
};

export type ConfirmMatchResult = {
  confirmed: boolean;
  integration?: Awaited<ReturnType<typeof upsertVenueIntegration>>;
  activation: ReturnType<typeof canActivateVenue> & { autoActivated: false };
};

/** Persist an explicit staff confirmation for a BestTime match; never activates implicitly. */
export async function confirmMatch(input: ConfirmMatchInput): Promise<ConfirmMatchResult> {
  if (!input.staff?.id || !input.confirmed) throw new Error("staff match confirmation is required");
  const venue = await findVenueById(input.db, input.venueId);
  if (!venue) throw new Error(`venue ${input.venueId} not found`);
  const snapshot = input.snapshot ?? (await getLatestForecastSnapshot(input.db, input.venueId));
  if (!snapshot) throw new Error("forecast snapshot not found");
  assertSameVenue("forecast snapshot", input.venueId, snapshot.venueId);
  if (!snapshot.providerVenueId || !snapshot.matchedName || !snapshot.matchedAddress) {
    throw new Error("forecast snapshot has no usable provider match");
  }
  const match = scoreVenueMatch(
    { name: venue.name, address: venue.address },
    { name: snapshot.matchedName, address: snapshot.matchedAddress },
  );
  if (match.decision === "blocked") throw new Error("venue match is blocked");
  if (snapshot.expiresAt && snapshot.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    throw new Error("forecast snapshot is stale");
  }

  const confirmedAt = input.now ?? new Date();
  const integration = await upsertVenueIntegration(input.db, {
    venueId: input.venueId,
    provider: "besttime",
    externalId: snapshot.providerVenueId,
    metadata: {
      matchedName: snapshot.matchedName,
      matchedAddress: snapshot.matchedAddress,
      matchScore: match.totalScore,
      confirmedBy: input.staff.id,
    },
    confirmedAt,
  });
  await appendAuditEvent(input.db, {
    actorType: "staff",
    actorId: input.staff.id,
    action: "venue_match_confirmed",
    objectType: "venue",
    objectId: input.venueId,
    metadata: { provider: "besttime", providerVenueId: snapshot.providerVenueId, matchScore: match.totalScore, outcome: "confirmed" },
  });  const templates = await listActiveOfferTemplates(input.db, input.venueId);
  const integrations = await listVenueIntegrations(input.db, input.venueId);
  const woztell = integrations.find((integration) => integration.provider === "woztell");
  const metadata = (woztell?.metadata ?? {}) as Record<string, unknown>;
  const activation = canActivateVenue({
    forecastAvailable: Boolean(snapshot.payload && Object.keys(snapshot.payload).length > 0),
    matchConfirmed: true,
    businessHoursConfigured: Object.keys(venue.businessHours ?? {}).length > 0,
    ownerReference: typeof metadata.ownerReference === "string" ? metadata.ownerReference : undefined,
    channelReference: typeof metadata.channelReference === "string" ? metadata.channelReference : undefined,
    audienceReference: typeof metadata.audienceReference === "string" ? metadata.audienceReference : undefined,
    activeOfferTemplate: templates.length > 0,
  });
  return { confirmed: true, integration, activation: { ...activation, autoActivated: false } };
}

export const confirmVenueMatch = confirmMatch;
