ALTER TABLE "audit_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_idempotency_key_idx" ON "audit_events" USING btree ("idempotency_key");