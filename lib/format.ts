import type { N } from "./types";

export const DASH = "—";

export const BRANCHES = ["BGC", "PPM", "POD", "LEV", "EROD"] as const;

export const NAMES: Record<string, string> = {
  BGC: "BGC",
  PPM: "Power Plant",
  POD: "Podium",
  LEV: "Leviste",
  EROD: "E. Rodriguez",
  SHP: "Shopee",
  LZD: "Lazada",
  TKT: "TikTok",
  B2B: "B2B",
  EVENT: "Events",
  HO: "Head Office",
};

export const name = (code: string) => NAMES[code] ?? code;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Sum that is unknown (null) if any part is null or the list is empty. */
export function sum(vals: N[]): N {
  if (vals.length === 0) return null;
  let t = 0;
  for (const v of vals) {
    if (!isNum(v)) return null;
    t += v;
  }
  return t;
}

export function div(a: N, b: N): N {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return a / b;
}

/** Weighted mean; unknown if any value or weight is null. */
export function wmean(pairs: [N, N][]): N {
  let num = 0;
  let den = 0;
  for (const [v, w] of pairs) {
    if (!isNum(v) || !isNum(w)) return null;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

const int = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

export const peso = (v: N) => (isNum(v) ? `₱${int.format(Math.round(v))}` : DASH);
export const num = (v: N) => (isNum(v) ? int.format(Math.round(v)) : DASH);
export const pct = (v: N, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : DASH);
export const ratioPct = (v: N) => (isNum(v) ? `${Math.round(v * 100)}%` : DASH);
export const stars = (v: N) => (isNum(v) ? `${v.toFixed(2)}★` : DASH);
export const signedPct = (v: N) => (isNum(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : DASH);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-20" -> "20 Sep" (no timezone drift). */
export function day(iso: string | null | undefined, withYear = false): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** Today's date in Manila (UTC+8) as YYYY-MM-DD. */
export function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (fromIso: string, toIso: string) => Math.round((utc(toIso) - utc(fromIso)) / 86400000);
