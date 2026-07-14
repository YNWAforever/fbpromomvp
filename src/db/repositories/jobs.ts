import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { jobRuns } from "../schema";

export type NewJobRun = typeof jobRuns.$inferInsert;
export type JobRun = typeof jobRuns.$inferSelect;
export type JobRunClaim = { run: JobRun | undefined; claimed: boolean };

export async function findJobRunByIdempotencyKey(db: DatabaseExecutor, idempotencyKey: string) {
  const [run] = await db.select().from(jobRuns).where(eq(jobRuns.idempotencyKey, idempotencyKey)).limit(1);
  return run;
}

export async function createJobRun(db: DatabaseExecutor, values: NewJobRun) {
  const [run] = await db.insert(jobRuns).values(values).returning();
  return run;
}

/**
 * Atomically claims a monitor run. The insert winner owns a new key; a failed
 * run may be claimed once for retry, while a running/completed row is owned by
 * another request and must not be processed again.
 */
export async function claimJobRun(db: DatabaseExecutor, values: NewJobRun): Promise<JobRunClaim> {
  const [created] = await db
    .insert(jobRuns)
    .values(values)
    .onConflictDoNothing({ target: jobRuns.idempotencyKey })
    .returning();
  if (created) return { run: created, claimed: true };

  const [retry] = await db
    .update(jobRuns)
    .set({ state: values.state, attempts: values.attempts, completedAt: null, result: null })
    .where(and(eq(jobRuns.idempotencyKey, values.idempotencyKey), eq(jobRuns.state, "failed")))
    .returning();
  if (retry) return { run: retry, claimed: true };

  return { run: await findJobRunByIdempotencyKey(db, values.idempotencyKey), claimed: false };
}

export async function updateJobRun(db: DatabaseExecutor, id: string, values: Partial<NewJobRun>) {
  const [run] = await db.update(jobRuns).set(values).where(eq(jobRuns.id, id)).returning();
  return run;
}

export const completeJobRun = updateJobRun;
