import "server-only";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __fsSql?: Sql };

export function db(): Sql {
  if (!g.__fsSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__fsSql = postgres(url, { ssl: "require", prepare: false, max: 4 });
  }
  return g.__fsSql;
}
