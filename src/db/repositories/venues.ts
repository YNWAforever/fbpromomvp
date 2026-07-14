import { and, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { forecastSnapshots, offerTemplates, venueIntegrations, venues } from "../schema";

export type NewVenue = typeof venues.$inferInsert;
export type NewVenueIntegration = typeof venueIntegrations.$inferInsert;
export type NewOfferTemplate = typeof offerTemplates.$inferInsert;
export type NewForecastSnapshot = typeof forecastSnapshots.$inferInsert;

export async function createVenueIdempotent(db: DatabaseExecutor, values: NewVenue) {
  if (values.idempotencyKey) {
    const [venue] = await db
      .insert(venues)
      .values(values)
      .onConflictDoNothing({ target: venues.idempotencyKey })
      .returning();
    if (venue) return { venue, created: true };
    const existing = await getVenueByIdempotencyKey(db, values.idempotencyKey);
    if (existing) return { venue: existing, created: false };
    throw new Error(`venue idempotency key ${values.idempotencyKey} was not persisted`);
  }
  const [venue] = await db.insert(venues).values(values).returning();
  return { venue, created: true };
}

export async function createVenue(db: DatabaseExecutor, values: NewVenue) {
  return (await createVenueIdempotent(db, values)).venue;
}

export async function getVenue(db: DatabaseExecutor, id: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return venue;
}

export async function listActiveVenues(db: DatabaseExecutor, limit = 25) {
  return db.select().from(venues).where(eq(venues.status, "active")).orderBy(venues.name).limit(limit);
}

export async function getVenueByIdempotencyKey(db: DatabaseExecutor, idempotencyKey: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.idempotencyKey, idempotencyKey)).limit(1);
  return venue;
}
export async function updateVenue(db: DatabaseExecutor, id: string, values: Partial<NewVenue>) {
  const [venue] = await db
    .update(venues)
    .set(values)
    .where(eq(venues.id, id))
    .returning();
  return venue;
}

export async function upsertVenueIntegration(db: DatabaseExecutor, values: NewVenueIntegration) {
  const [integration] = await db
    .insert(venueIntegrations)
    .values(values)
    .onConflictDoUpdate({
      target: [venueIntegrations.venueId, venueIntegrations.provider],
      set: {
        externalId: values.externalId,
        metadata: values.metadata,
        confirmedAt: values.confirmedAt,
      },
    })
    .returning();
  return integration;
}

export async function listVenueIntegrations(db: DatabaseExecutor, venueId: string) {
  return db.select().from(venueIntegrations).where(eq(venueIntegrations.venueId, venueId));
}

export async function createOfferTemplate(db: DatabaseExecutor, values: NewOfferTemplate) {
  const [template] = await db.insert(offerTemplates).values(values).returning();
  return template;
}

export async function listActiveOfferTemplates(db: DatabaseExecutor, venueId: string) {
  return db
    .select()
    .from(offerTemplates)
    .where(and(eq(offerTemplates.venueId, venueId), eq(offerTemplates.active, true)))
    .orderBy(offerTemplates.name);
}

export async function createForecastSnapshot(db: DatabaseExecutor, values: NewForecastSnapshot) {
  if (values.requestKey) {
    const [snapshot] = await db
      .insert(forecastSnapshots)
      .values(values)
      .onConflictDoNothing({ target: [forecastSnapshots.venueId, forecastSnapshots.requestKey] })
      .returning();
    return snapshot ?? getForecastSnapshotByRequestKey(db, values.venueId, values.requestKey);
  }
  const [snapshot] = await db.insert(forecastSnapshots).values(values).returning();
  return snapshot;
}

export async function getForecastSnapshotByRequestKey(db: DatabaseExecutor, venueId: string, requestKey: string) {
  const [snapshot] = await db
    .select()
    .from(forecastSnapshots)
    .where(and(eq(forecastSnapshots.venueId, venueId), eq(forecastSnapshots.requestKey, requestKey)))
    .limit(1);
  return snapshot;
}
export async function getLatestForecastSnapshot(db: DatabaseExecutor, venueId: string) {
  const [snapshot] = await db
    .select()
    .from(forecastSnapshots)
    .where(eq(forecastSnapshots.venueId, venueId))
    .orderBy(desc(forecastSnapshots.fetchedAt))
    .limit(1);
  return snapshot;
}

// Explicit aliases keep repository call sites intention-revealing as the application grows.
export const findVenueById = getVenue;
export const insertVenue = createVenue;
