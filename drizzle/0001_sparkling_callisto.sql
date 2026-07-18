ALTER TABLE "forecast_snapshots" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_snapshots_venue_request_idx" ON "forecast_snapshots" USING btree ("venue_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_idempotency_key_idx" ON "venues" USING btree ("idempotency_key");
