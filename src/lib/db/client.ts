import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/** Driver-agnostic handle: Neon HTTP or node-postgres at runtime, PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function isNeonUrl(databaseUrl: string): boolean {
  return new URL(databaseUrl).hostname.endsWith(".neon.tech");
}

/**
 * Neon (production) uses its HTTP driver, which suits serverless: no connection pool to
 * exhaust across function instances. It has no interactive transactions, so writes are
 * designed to be safe as independent statements. Any other Postgres (local Docker) uses
 * a small standard TCP pool.
 */
export function createDatabase(databaseUrl: string): Database {
  if (isNeonUrl(databaseUrl)) return drizzleNeonHttp(neon(databaseUrl), { schema });
  return drizzleNodePg(new Pool({ connectionString: databaseUrl, max: 5 }), { schema });
}
