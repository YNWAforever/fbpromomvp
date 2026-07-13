CREATE TABLE IF NOT EXISTS "staff_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "venues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "name" text NOT NULL,
  "address" text NOT NULL,
  "category" text NOT NULL,
  "timezone" text DEFAULT 'Asia/Hong_Kong' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trigger_delta" double precision,
  "previous_delta" double precision,
  "daily_limit" integer DEFAULT 1 NOT NULL,
  "weekly_limit" integer DEFAULT 3 NOT NULL,
  "approval_timeout_minutes" integer DEFAULT 15 NOT NULL,
  "baseline_sales" double precision,
  "average_order_value" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "venue_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confirmed_at" timestamp with time zone,
  CONSTRAINT "venue_integrations_venue_provider_idx" UNIQUE("venue_id","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offer_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "name" text NOT NULL,
  "offer_facts" jsonb NOT NULL,
  "woztell_message_payload" jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forecast_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "provider_venue_id" text,
  "matched_name" text,
  "matched_address" text,
  "match_score" double precision,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_readings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "forecasted_busyness" double precision,
  "live_busyness" double precision,
  "delta" double precision,
  "status" text NOT NULL,
  "error_code" text,
  "provider_request_id" text,
  CONSTRAINT "live_readings_venue_observed_at_idx" UNIQUE("venue_id","observed_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "triggers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "live_reading_id" uuid,
  "idempotency_key" text NOT NULL,
  "decision" text NOT NULL,
  "reason" text NOT NULL,
  CONSTRAINT "triggers_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "copy_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trigger_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "body" text NOT NULL,
  "source" text NOT NULL,
  "valid" boolean NOT NULL,
  "validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trigger_id" uuid NOT NULL,
  "state" text NOT NULL,
  "selected_candidate_id" uuid,
  "provider_message_id" text,
  "expires_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "approvals_trigger_id_idx" UNIQUE("trigger_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "approval_id" uuid NOT NULL,
  "campaign_code" text NOT NULL,
  "body" text NOT NULL,
  "state" text NOT NULL,
  "valid_from" timestamp with time zone NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "provider_broadcast_id" text,
  "member_count" integer,
  "sent_count" integer,
  "accepted_at" timestamp with time zone,
  CONSTRAINT "promotions_approval_id_idx" UNIQUE("approval_id"),
  CONSTRAINT "promotions_campaign_code_unique" UNIQUE("campaign_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "promotion_id" uuid NOT NULL,
  "count" integer NOT NULL,
  "note" text,
  "revision" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "redemption_reports_promotion_id_idx" UNIQUE("promotion_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_id" uuid NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "chart_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "state" text NOT NULL,
  "provider_message_id" text,
  CONSTRAINT "weekly_reports_venue_period_idx" UNIQUE("venue_id","period_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "kind" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "state" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "result" jsonb,
  "completed_at" timestamp with time zone,
  CONSTRAINT "job_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "action" text NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_integrations" ADD CONSTRAINT "venue_integrations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offer_templates" ADD CONSTRAINT "offer_templates_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_readings" ADD CONSTRAINT "live_readings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_live_reading_id_live_readings_id_fk" FOREIGN KEY ("live_reading_id") REFERENCES "live_readings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "copy_candidates" ADD CONSTRAINT "copy_candidates_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_selected_candidate_id_copy_candidates_id_fk" FOREIGN KEY ("selected_candidate_id") REFERENCES "copy_candidates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "redemption_reports" ADD CONSTRAINT "redemption_reports_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE cascade ON UPDATE no action;
