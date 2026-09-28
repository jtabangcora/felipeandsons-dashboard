import type { N } from "./types";

export const DASH = "—";

export function peso(v: N | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH;
  return "₱" + Number(v).toLocaleString("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function num(v: N | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH;
  return Number(v).toLocaleString("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function pct(v: N | undefined, dp = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH;
  return Number(v).toFixed(dp) + "%";
}
/** ratio 0..1 -> percent */
export function ratio(v: N | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return DASH;
  return (Number(v) * 100).toFixed(dp) + "%";
}
export function delta(cur: N | undefined, prev: N | undefined): N {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}
/** Sum that is unknown the moment any part is unknown. */
export function sumAll(vals: (N | undefined)[]): N {
  let s = 0;
  for (const v of vals) {
    if (v === null || v === undefined) return null;
    s += Number(v);
  }
  return s;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dshort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]}`;
}
export function dlong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}
export function monthName(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return ["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1];
}
export function quarterName(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return "Q" + Math.ceil(m / 3);
}
export const BRANCH_NAME: Record<string, string> = {
  BGC: "BGC", PPM: "Power Plant", POD: "Podium", LEV: "Leviste", EROD: "E. Rodriguez",
  SHP: "Shopee", LZD: "Lazada", TKT: "TikTok", B2B: "B2B", EVENT: "Events",
};
