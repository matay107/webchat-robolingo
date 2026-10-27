import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Driver-agnostic handle: Neon over HTTP in production, PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Neon's HTTP driver suits serverless: no connection pool to exhaust across
 * function instances. It has no interactive transactions, so writes are designed
 * to be safe as independent statements.
 */
export function createDatabase(databaseUrl: string): Database {
  return drizzle(neon(databaseUrl), { schema });
}
