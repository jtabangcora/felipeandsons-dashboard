export type N = number | null;

export interface ChannelWeek {
  we: string; net: N; retail: N; ft: N; buyers: N; arpu: N; bav: N; bat: N; chairs: N; open: N;
}
export interface Channel { channel: string; kind: "shop" | "ecom" | "other"; weeks: ChannelWeek[] }
export interface Period {
  label: "month" | "quarter"; start: string; end: string; elapsed: number; length: number;
  barbershop: N; retail: N;
  target_barbershop: N; basis_barbershop: string | null;
  target_retail: N; basis_retail: string | null;
  target_branch: Record<string, number> | null;
  by_channel: Record<string, { net: N; retail: N }> | null;
}
export interface Sales {
  end: string; n: number; weeks: string[]; channels: Channel[]; periods: Period[];
  haberdashery: { month_target: N; quarter_target: N; orders_loaded: number };
  data_through: string;
}

export interface CustWeek {
  we: string; served: N; new: N; repeat: N; repeat_pct: N; capture_pct: N;
  walkins: N; booked: N; turn_downs: N; cancel_pct: N; no_show_pct: N; conversion_pct: N;
}
export interface CustBranch {
  branch: string; weeks: CustWeek[];
  life: { customers: number; returning: number; returning_pct: N; lapse_days: N; active: N; lapsed: N } | null;
  reviews: { count: number; stars: N; low: number };
  reviews_all: { count: number; stars: N } | null;
}
export interface Customers {
  end: string; n: number; branches: CustBranch[];
  company: { customers: number; returning: number; returning_pct: N };
  reviews_through: string; ybe_through: string;
}

export interface Barber {
  branch: string; barber: string; roving: boolean; role: string;
  net: N; clients: N; retail: N; days: N; complete: boolean;
  arpu: N; arpu_target: N; repeat_pct: N; praise: number;
  weeks: { we: string; net: N; clients: N }[];
}
export interface Team {
  end: string; n: number; barbers: Barber[] | null;
  gates: Record<string, { we: string; ok: boolean }[]> | null;
  hiring: { role: string; branch: string; type: string; status: string; fill_by: string | null; seat: number }[] | null;
  reviews_through: string;
}
