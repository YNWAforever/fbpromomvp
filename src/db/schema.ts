import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull();

export const staffUsers = pgTable("staff_users", {
  id: id(),
  createdAt: createdAt(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const venues = pgTable("venues", {
  id: id(),
  idempotencyKey: text("idempotency_key"),
  createdAt: createdAt(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  category: text("category").notNull(),
  timezone: text("timezone").notNull().default("Asia/Hong_Kong"),
  status: text("status").notNull().default("draft"),
  businessHours: jsonb("business_hours").$type<Record<string, unknown>>().notNull().default({}),
  triggerDelta: doublePrecision("trigger_delta"),
  previousDelta: doublePrecision("previous_delta"),
  dailyLimit: integer("daily_limit").notNull().default(1),
  weeklyLimit: integer("weekly_limit").notNull().default(3),
  approvalTimeoutMinutes: integer("approval_timeout_minutes").notNull().default(15),
  baselineSales: doublePrecision("baseline_sales"),
  averageOrderValue: doublePrecision("average_order_value"),
}, (table) => [uniqueIndex("venues_idempotency_key_idx").on(table.idempotencyKey)]);

export const venueIntegrations = pgTable(
  "venue_integrations",
  {
    id: id(),
    createdAt: createdAt(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [uniqueIndex("venue_integrations_venue_provider_idx").on(table.venueId, table.provider)],
);

export const offerTemplates = pgTable("offer_templates", {
  id: id(),
  createdAt: createdAt(),
  venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  offerFacts: jsonb("offer_facts").$type<Record<string, unknown>>().notNull(),
  woztellMessagePayload: jsonb("woztell_message_payload").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").notNull().default(true),
});

export const forecastSnapshots = pgTable("forecast_snapshots", {
  id: id(),
  requestKey: text("request_key"),
  createdAt: createdAt(),
  venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
  providerVenueId: text("provider_venue_id"),
  matchedName: text("matched_name"),
  matchedAddress: text("matched_address"),
  matchScore: doublePrecision("match_score"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [uniqueIndex("forecast_snapshots_venue_request_idx").on(table.venueId, table.requestKey)]);

export const liveReadings = pgTable(
  "live_readings",
  {
    id: id(),
    createdAt: createdAt(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    forecastedBusyness: doublePrecision("forecasted_busyness"),
    liveBusyness: doublePrecision("live_busyness"),
    delta: doublePrecision("delta"),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    providerRequestId: text("provider_request_id"),
  },
  (table) => [
    uniqueIndex("live_readings_venue_observed_at_idx").on(table.venueId, table.observedAt),
    uniqueIndex("live_readings_venue_id_idx").on(table.venueId, table.id),
  ],
);

export const triggers = pgTable(
  "triggers",
  {
    id: id(),
    createdAt: createdAt(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    liveReadingId: uuid("live_reading_id").references(() => liveReadings.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    decision: text("decision").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    uniqueIndex("triggers_venue_id_idx").on(table.venueId, table.id),
    foreignKey({
      columns: [table.venueId, table.liveReadingId],
      foreignColumns: [liveReadings.venueId, liveReadings.id],
      name: "triggers_venue_live_reading_fk",
    }),
  ],
);

export const copyCandidates = pgTable(
  "copy_candidates",
  {
    id: id(),
    createdAt: createdAt(),
    triggerId: uuid("trigger_id").notNull().references(() => triggers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    body: text("body").notNull(),
    source: text("source").notNull(),
    valid: boolean("valid").notNull(),
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
  },
  (table) => [uniqueIndex("copy_candidates_trigger_id_idx").on(table.triggerId, table.id)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    createdAt: createdAt(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id").notNull(),
    state: text("state").notNull(),
    selectedCandidateId: uuid("selected_candidate_id").references(() => copyCandidates.id, { onDelete: "set null" }),
    providerMessageId: text("provider_message_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("approvals_trigger_idx").on(table.triggerId),
    uniqueIndex("approvals_venue_id_idx").on(table.venueId, table.id),
    foreignKey({
      columns: [table.venueId, table.triggerId],
      foreignColumns: [triggers.venueId, triggers.id],
      name: "approvals_venue_trigger_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.triggerId, table.selectedCandidateId],
      foreignColumns: [copyCandidates.triggerId, copyCandidates.id],
      name: "approvals_trigger_candidate_fk",
    }),
    check(
      "approvals_expiry_window_check",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '15 minutes'`,
    ),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: id(),
    createdAt: createdAt(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    approvalId: uuid("approval_id").notNull(),
    campaignCode: text("campaign_code").notNull().unique(),
    body: text("body").notNull(),
    state: text("state").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }).notNull(),
    providerBroadcastId: text("provider_broadcast_id"),
    memberCount: integer("member_count"),
    sentCount: integer("sent_count"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("promotions_approval_idx").on(table.approvalId),
    foreignKey({
      columns: [table.venueId, table.approvalId],
      foreignColumns: [approvals.venueId, approvals.id],
      name: "promotions_venue_approval_fk",
    }).onDelete("restrict"),
    check(
      "promotions_valid_window_check",
      sql`${table.validUntil} > ${table.validFrom} AND ${table.validUntil} <= ${table.validFrom} + interval '2 hours'`,
    ),
  ],
);

export const redemptionReports = pgTable(
  "redemption_reports",
  {
    id: id(),
    createdAt: createdAt(),
    promotionId: uuid("promotion_id").notNull().references(() => promotions.id, { onDelete: "cascade" }),
    count: integer("count").notNull(),
    note: text("note"),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("redemption_reports_promotion_idx").on(table.promotionId),
    check("redemption_reports_count_check", sql`${table.count} >= 0 AND ${table.count} <= 100000`),
    check("redemption_reports_revision_check", sql`${table.revision} > 0`),
  ],
);

export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: id(),
    createdAt: createdAt(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }).notNull(),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    chartPoints: jsonb("chart_points").$type<Array<Record<string, unknown>>>().notNull().default([]),
    state: text("state").notNull(),
    providerMessageId: text("provider_message_id"),
  },
  (table) => [uniqueIndex("weekly_reports_venue_period_idx").on(table.venueId, table.periodStart)],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    createdAt: createdAt(),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
);

export const auditEvents = pgTable("audit_events", {
  id: id(),
  createdAt: createdAt(),
  actorType: text("actor_type").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: uuid("object_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
});