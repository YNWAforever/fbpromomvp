CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"venue_id" uuid NOT NULL,
	"trigger_id" uuid NOT NULL,
	"state" text NOT NULL,
	"selected_candidate_id" uuid,
	"provider_message_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "approvals_expiry_window_check" CHECK ("approvals"."expires_at" > "approvals"."created_at" AND "approvals"."expires_at" <= "approvals"."created_at" + interval '15 minutes')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_candidates" (
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
CREATE TABLE "forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" text,
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
CREATE TABLE "job_runs" (
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
CREATE TABLE "live_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"venue_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"forecasted_busyness" double precision,
	"live_busyness" double precision,
	"delta" double precision,
	"status" text NOT NULL,
	"error_code" text,
	"provider_request_id" text
);
--> statement-breakpoint
CREATE TABLE "offer_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"offer_facts" jsonb NOT NULL,
	"woztell_message_payload" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
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
	CONSTRAINT "promotions_campaign_code_unique" UNIQUE("campaign_code"),
	CONSTRAINT "promotions_valid_window_check" CHECK ("promotions"."valid_until" > "promotions"."valid_from" AND "promotions"."valid_until" <= "promotions"."valid_from" + interval '2 hours')
);
--> statement-breakpoint
CREATE TABLE "redemption_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"count" integer NOT NULL,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemption_reports_count_check" CHECK ("redemption_reports"."count" >= 0 AND "redemption_reports"."count" <= 100000),
	CONSTRAINT "redemption_reports_revision_check" CHECK ("redemption_reports"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "triggers" (
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
CREATE TABLE "venue_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"venue_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text,
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
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"venue_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chart_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text NOT NULL,
	"provider_message_id" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_snapshots_venue_request_idx" ON "forecast_snapshots" USING btree ("venue_id","request_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "venues_idempotency_key_idx" ON "venues" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_trigger_idx" ON "approvals" USING btree ("trigger_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_venue_id_idx" ON "approvals" USING btree ("venue_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "copy_candidates_trigger_id_idx" ON "copy_candidates" USING btree ("trigger_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "live_readings_venue_observed_at_idx" ON "live_readings" USING btree ("venue_id","observed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "live_readings_venue_id_idx" ON "live_readings" USING btree ("venue_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_approval_idx" ON "promotions" USING btree ("approval_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "redemption_reports_promotion_idx" ON "redemption_reports" USING btree ("promotion_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "triggers_venue_id_idx" ON "triggers" USING btree ("venue_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "venue_integrations_venue_provider_idx" ON "venue_integrations" USING btree ("venue_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_venue_period_idx" ON "weekly_reports" USING btree ("venue_id","period_start");
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_selected_candidate_id_copy_candidates_id_fk" FOREIGN KEY ("selected_candidate_id") REFERENCES "public"."copy_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_venue_trigger_fk" FOREIGN KEY ("venue_id","trigger_id") REFERENCES "public"."triggers"("venue_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_trigger_candidate_fk" FOREIGN KEY ("trigger_id","selected_candidate_id") REFERENCES "public"."copy_candidates"("trigger_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_candidates" ADD CONSTRAINT "copy_candidates_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_readings" ADD CONSTRAINT "live_readings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_templates" ADD CONSTRAINT "offer_templates_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_venue_approval_fk" FOREIGN KEY ("venue_id","approval_id") REFERENCES "public"."approvals"("venue_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_reports" ADD CONSTRAINT "redemption_reports_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_live_reading_id_live_readings_id_fk" FOREIGN KEY ("live_reading_id") REFERENCES "public"."live_readings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_venue_live_reading_fk" FOREIGN KEY ("venue_id","live_reading_id") REFERENCES "public"."live_readings"("venue_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_integrations" ADD CONSTRAINT "venue_integrations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
