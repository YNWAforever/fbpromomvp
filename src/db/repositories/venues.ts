import { and, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { forecastSnapshots, offerTemplates, venueIntegrations, venues } from "../schema";

export type NewVenue = typeof venues.$inferInsert;
export type NewVenueIntegration = typeof venueIntegrations.$inferInsert;
export type NewOfferTemplate = typeof offerTemplates.$inferInsert;
export type NewForecastSnapshot = typeof forecastSnapshots.$inferInsert;

export async function createVenue(db: DatabaseExecutor, values: NewVenue) {
  const [venue] = await db.insert(venues).values(values).returning();
  return venue;
}

export async function getVenue(db: DatabaseExecutor, id: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return venue;
}

export async function listActiveVenues(db: DatabaseExecutor) {
  return db.select().from(venues).where(eq(venues.status, "active")).orderBy(venues.name);
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
  const [snapshot] = await db.insert(forecastSnapshots).values(values).returning();
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
