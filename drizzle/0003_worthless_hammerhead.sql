ALTER TABLE "copy_candidates" ADD COLUMN "ordinal" integer;
--> statement-breakpoint
ALTER TABLE "copy_candidates" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "trigger_id", "version" ORDER BY "created_at", "id") - 1 AS "ordinal"
  FROM "copy_candidates"
)
UPDATE "copy_candidates" AS candidates
SET "ordinal" = ranked."ordinal"
FROM ranked
WHERE candidates."id" = ranked."id";
--> statement-breakpoint
ALTER TABLE "copy_candidates" ALTER COLUMN "ordinal" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "copy_candidates" ALTER COLUMN "ordinal" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "copy_candidates_trigger_version_ordinal_idx" ON "copy_candidates" USING btree ("trigger_id","version","ordinal");