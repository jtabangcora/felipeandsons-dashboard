import { unstable_cache } from "next/cache";
import { sql } from "./db";
import type { Sales, Customers, Team } from "./types";

// Source data is loaded weekly, so an hour of caching costs nothing and keeps the page fast.
const HOUR = 3600;

export const getWeeks = unstable_cache(
  async (): Promise<string[]> => {
    const r = await sql()`select dash.weeks() as j`;
    return r[0].j as string[];
  },
  ["dash-weeks-v1"],
  { revalidate: HOUR },
);

export const getSales = unstable_cache(
  async (we: string, n: number): Promise<Sales> => {
    const r = await sql()`select dash.sales(${we}::date, ${n}::int) as j`;
    return r[0].j as Sales;
  },
  ["dash-sales-v1"],
  { revalidate: HOUR },
);

export const getCustomers = unstable_cache(
  async (we: string, n: number): Promise<Customers> => {
    const r = await sql()`select dash.customers(${we}::date, ${n}::int) as j`;
    return r[0].j as Customers;
  },
  ["dash-customers-v1"],
  { revalidate: HOUR },
);

export const getTeam = unstable_cache(
  async (we: string, n: number): Promise<Team> => {
    const r = await sql()`select dash.team(${we}::date, ${n}::int) as j`;
    return r[0].j as Team;
  },
  ["dash-team-v1"],
  { revalidate: HOUR },
);
