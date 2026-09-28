import postgres from "postgres";

// Server-side only. DATABASE_URL names the dash_reader Postgres role, which can do exactly one
// thing: execute the read-only functions in the `dash` schema. It has no table grants.

declare global {
  // eslint-disable-next-line no-var
  var __dashSql: ReturnType<typeof postgres> | undefined;
}

export function sql() {
  if (!globalThis.__dashSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__dashSql = postgres(url, {
      ssl: "require",
      prepare: false, // Supavisor transaction pooler
      max: 4,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return globalThis.__dashSql;
}
