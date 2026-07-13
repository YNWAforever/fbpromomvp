import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import ws from "ws";
import { env } from "@/env";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export type Database = NeonDatabase<typeof schema>;
/** A request-scoped database or a transaction opened by its caller. */
export type DatabaseExecutor = Database | PgTransaction<PgQueryResultHKT, Record<string, unknown>, Record<string, never>>;

export async function withDatabase<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    return await work(drizzle(pool, { schema }));
  } finally {
    await pool.end();
  }
}

