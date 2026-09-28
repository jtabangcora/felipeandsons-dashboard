import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import type { Customers, Sales, Team } from "./types";

const opts = { revalidate: 3600 };

export const getWeeks = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db()`select dash.weeks() as j`;
    return (rows[0]?.j ?? []) as string[];
  },
  ["dash.weeks"],
  opts,
);

export const getSales = unstable_cache(
  async (we: string, n: number): Promise<Sales> => {
    const rows = await db()`select dash.sales(${we}::date, ${n}::int) as j`;
    return rows[0].j as Sales;
  },
  ["dash.sales"],
  opts,
);

export const getCustomers = unstable_cache(
  async (we: string, n: number): Promise<Customers> => {
    const rows = await db()`select dash.customers(${we}::date, ${n}::int) as j`;
    return rows[0].j as Customers;
  },
  ["dash.customers"],
  opts,
);

export const getTeam = unstable_cache(
  async (we: string, n: number): Promise<Team> => {
    const rows = await db()`select dash.team(${we}::date, ${n}::int) as j`;
    return rows[0].j as Team;
  },
  ["dash.team"],
  opts,
);
