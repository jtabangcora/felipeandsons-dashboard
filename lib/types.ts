export type N = number | null;

export type ChannelCode = "BGC" | "PPM" | "POD" | "LEV" | "EROD" | "SHP" | "LZD" | "TKT" | "B2B" | "EVENT";

export interface ChannelWeek {
  we: string;
  net: N;
  retail: N;
  ft: N;
  buyers: N;
  arpu: N;
  bav: N;
  bat: N;
  chairs: N;
  open: N;
}

export interface Period {
  label: "month" | "quarter";
  start: string;
  end: string;
  elapsed: number;
  length: number;
  barbershop: N;
  retail: N;
  target_barbershop: N;
  basis_barbershop: string | null;
  target_retail: N;
  basis_retail: string | null;
}

export interface Sales {
  end: string;
  n: number;
  weeks: string[];
  data_through: string | null;
  channels: { channel: ChannelCode; kind: "shop" | "ecom" | "other"; weeks: ChannelWeek[] }[];
  periods: Period[];
  haberdashery: { month_target: N; quarter_target: N; orders_loaded: number | boolean | null };
}

export interface CustWeek {
  we: string;
  served: N;
  new: N;
  repeat: N;
  repeat_pct: N;
  capture_pct: N;
  walkins: N;
  booked: N;
  turn_downs: N;
  cancel_pct: N;
  no_show_pct: N;
  conversion_pct: N;
}

export interface Customers {
  end: string;
  n: number;
  reviews_through: string | null;
  ybe_through: string | null;
  company: { customers: N; returning: N; returning_pct: N };
  branches: {
    branch: string;
    weeks: CustWeek[];
    life: { customers: N; returning: N; returning_pct: N; lapse_days: N; active: N; lapsed: N } | null;
    reviews: { count: N; stars: N; low: N };
    reviews_all: { count: N; stars: N } | null;
  }[];
}

export interface Barber {
  branch: string;
  barber: string;
  roving: boolean;
  role: "barber" | "head" | "roving";
  net: N;
  clients: N;
  retail: N;
  days: N;
  complete: boolean;
  arpu: N;
  arpu_target: N;
  repeat_pct: N;
  praise: N;
  weeks: { we: string; net: N; clients: N }[];
}

export interface Team {
  end: string;
  n: number;
  reviews_through: string | null;
  barbers: Barber[] | null;
  gates: Record<string, { we: string; ok: boolean }[]> | null;
  hiring: { role: string; branch: string; type: string; status: string | null; fill_by: string | null; seat: N }[] | null;
}
