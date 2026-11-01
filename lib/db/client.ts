import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function createDatabase(url: string) {
  const client = postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required for Supabase's transaction pooler (Supavisor / PgBouncer).
    prepare: false,
  });

  return drizzle(client, { schema });
}

type Database = ReturnType<typeof createDatabase>;

const globalForDb = globalThis as unknown as {
  betappDb?: Database;
};

export function getDb(): Database {
  if (globalForDb.betappDb) {
    return globalForDb.betappDb;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Add the Supabase pooler connection string to .env.local.",
    );
  }

  globalForDb.betappDb = createDatabase(url);
  return globalForDb.betappDb;
}

export { schema };
