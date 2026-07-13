import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client";
import { jobRuns } from "../schema";

export type NewJobRun = typeof jobRuns.$inferInsert;

export async function findJobRunByIdempotencyKey(db: DatabaseExecutor, idempotencyKey: string) {
  const [run] = await db.select().from(jobRuns).where(eq(jobRuns.idempotencyKey, idempotencyKey)).limit(1);
  return run;
}

export async function createJobRun(db: DatabaseExecutor, values: NewJobRun) {
  const [run] = await db.insert(jobRuns).values(values).returning();
  return run;
}

export async function claimJobRun(db: DatabaseExecutor, values: NewJobRun) {
  const [run] = await db
    .insert(jobRuns)
    .values(values)
    .onConflictDoNothing({ target: jobRuns.idempotencyKey })
    .returning();
  return run ?? findJobRunByIdempotencyKey(db, values.idempotencyKey);
}

export async function updateJobRun(db: DatabaseExecutor, id: string, values: Partial<NewJobRun>) {
  const [run] = await db.update(jobRuns).set(values).where(eq(jobRuns.id, id)).returning();
  return run;
}

export const completeJobRun = updateJobRun;
