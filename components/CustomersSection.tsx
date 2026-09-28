import type { Customers, CustWeek, N } from "@/lib/types";
import { BRANCHES, DASH, day, div, name, num, pct, stars, sum, wmean } from "@/lib/format";
import { Card, SectionHead, Spark, Tile } from "./ui";

type Field = keyof Omit<CustWeek, "we">;

export default function CustomersSection({ cust }: { cust: Customers }) {
  const byBranch = new Map(cust.branches.map((b) => [b.branch, b]));
  const order = [...BRANCHES.filter((b) => byBranch.has(b)), ...cust.branches.map((b) => b.branch).filter((b) => !(BRANCHES as readonly string[]).includes(b))];
  const weekMaps = new Map(cust.branches.map((b) => [b.branch, new Map(b.weeks.map((w) => [w.we, w]))]));
  const get = (branch: string, we: string | undefined, f: Field): N => {
    if (!we) return null;
    const v = weekMaps.get(branch)?.get(we)?.[f];
    return typeof v === "number" ? v : null;
  };

  const weeks = [...new Set(cust.branches.flatMap((b) => b.weeks.map((w) => w.we)))].sort();
  const sel = cust.end;
  const selIdx = weeks.indexOf(sel);
  const prior = selIdx > 0 ? weeks[selIdx - 1] : undefined;
  const last6 = weeks.slice(-6);

  const sysSum = (we: string | undefined, f: Field) => sum(order.map((b) => get(b, we, f)));
  const sysShare = (we: string | undefined) => {
    const r = sysSum(we, "repeat");
    const nw = sysSum(we, "new");
    return r === null || nw === null ? null : div(r * 100, r + nw);
  };
  const sysWeighted = (we: string, f: Field, w: Field) => wmean(order.map((b) => [get(b, we, f), get(b, we, w)]));

  // Tiles
  const servedSeries = weeks.map((w) => sysSum(w, "served"));
  const servedNow = sysSum(sel, "served");
  const servedPrev = sysSum(prior, "served");
  const shareNow = sysShare(sel);
  const sharePrev = sysShare(prior);
  const revCount = sum(cust.branches.map((b) => b.reviews?.count ?? null));
  const revStars = wmean(cust.branches.filter((b) => (b.reviews?.count ?? 0) > 0).map((b) => [b.reviews.stars, b.reviews.count]));

  const detailRow = (label: string, v: Record<string, N>, cls?: string) => (
    <tr key={label} className={cls}>
      <td>{label}</td>
      <td>{num(v.served)}</td>
      <td>{num(v.new)}</td>
      <td>{num(v.repeat)}</td>
      <td>{pct(v.repeat_pct)}</td>
      <td>
        {num(v.walkins)} / {num(v.booked)}
      </td>
      <td>{num(v.turn_downs)}</td>
      <td>{pct(v.cancel_pct)}</td>
      <td>{pct(v.no_show_pct)}</td>
      <td>{pct(v.conversion_pct)}</td>
      <td>{pct(v.capture_pct)}</td>
    </tr>
  );
  const fields: Field[] = ["served", "new", "repeat", "repeat_pct", "walkins", "booked", "turn_downs", "cancel_pct", "no_show_pct", "conversion_pct", "capture_pct"];
  const branchDetail = (b: string) => Object.fromEntries(fields.map((f) => [f, get(b, sel, f)])) as Record<string, N>;
  const systemDetail: Record<string, N> = {
    served: sysSum(sel, "served"),
    new: sysSum(sel, "new"),
    repeat: sysSum(sel, "repeat"),
    repeat_pct: sysShare(sel),
    walkins: sysSum(sel, "walkins"),
    booked: sysSum(sel, "booked"),
    turn_downs: sysSum(sel, "turn_downs"),
    cancel_pct: sysWeighted(sel, "cancel_pct", "booked"),
    no_show_pct: sysWeighted(sel, "no_show_pct", "booked"),
    conversion_pct: sysWeighted(sel, "conversion_pct", "served"),
    capture_pct: sysWeighted(sel, "capture_pct", "served"),
  };

  const byWeekTable = (f: "repeat_pct" | "served", system: (we: string) => N, fmt: (v: N) => string) => (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Branch</th>
            {last6.map((w) => (
              <th key={w}>{day(w)}</th>
            ))}
            <th className="l">Trend</th>
          </tr>
        </thead>
        <tbody>
          {[...order.map((b) => ({ label: name(b), vals: last6.map((w) => get(b, w, f)), cls: undefined as string | undefined })),
            { label: "F&S System", vals: last6.map((w) => system(w)), cls: "total" }].map((r) => (
            <tr key={r.label} className={r.cls}>
              <td>{r.label}</td>
              {r.vals.map((v, i) => (
                <td key={last6[i]}>{fmt(v)}</td>
              ))}
              <td className="spark-cell">
                <Spark values={r.vals} width={56} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // 07 lifetime
  const lifeRows = order.map((b) => {
    const br = byBranch.get(b)!;
    return {
      label: name(b),
      customers: br.life?.customers ?? null,
      returning: br.life?.returning ?? null,
      share: br.life?.returning_pct ?? null,
      active: br.life?.active ?? null,
      lapsed: br.life?.lapsed ?? null,
      lapse: br.life?.lapse_days ?? null,
      rc: br.reviews?.count ?? null,
      rs: br.reviews?.stars ?? null,
      low: br.reviews?.low ?? null,
      all: br.reviews_all?.stars ?? null,
    };
  });
  const lifeSystem = {
    label: "F&S System",
    customers: cust.company?.customers ?? null,
    returning: cust.company?.returning ?? null,
    share: cust.company?.returning_pct ?? null,
    active: null as N,
    lapsed: null as N,
    lapse: null as N,
    rc: revCount,
    rs: revStars,
    low: sum(lifeRows.map((r) => r.low)),
    all: wmean(cust.branches.map((b) => [b.reviews_all?.stars ?? null, b.reviews_all?.count ?? null])),
  };

  return (
    <section className="section" id="customers">
      <SectionHead
        id="customers-head"
        kicker="Customers"
        title="Customers"
        note={
          <>
            Week ending {day(sel, true)}. Bookings through {day(cust.ybe_through, true)}; Google reviews through {day(cust.reviews_through, true)}.
          </>
        }
      />

      <div className="tiles">
        <Tile label="Clients served this week" value={num(servedNow)} sub={`Prior week ${num(servedPrev)}`}>
          <Spark values={servedSeries} width={120} height={24} />
        </Tile>
        <Tile
          label="Returning share this week"
          value={pct(shareNow)}
          sub={
            <>
              Repeat ÷ (new + repeat). Prior week {pct(sharePrev)}
            </>
          }
        />
        <Tile
          label="Customers on record"
          value={num(cust.company?.customers ?? null)}
          sub={
            <>
              {num(cust.company?.returning ?? null)} came back ({pct(cust.company?.returning_pct ?? null)})
            </>
          }
        />
        <Tile label="Google reviews in window" value={num(revCount)} sub={<>Average {stars(revStars)} · through {day(cust.reviews_through)}</>} />
      </div>

      <Card
        num="04"
        title={`Demand and visits · week ending ${day(sel, true)}`}
        note="F&S System percentages are weighted: cancelled and no-show by bookings, conversion and phone capture by clients served."
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Served</th>
                <th>New</th>
                <th>Repeat</th>
                <th>Returning</th>
                <th>Walk-ins / booked</th>
                <th>Turn-downs</th>
                <th>Cancelled</th>
                <th>No-show</th>
                <th>Retail conv.</th>
                <th>Phone capture</th>
              </tr>
            </thead>
            <tbody>
              {order.map((b) => detailRow(name(b), branchDetail(b)))}
              {detailRow("F&S System", systemDetail, "total")}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="pair">
        <Card num="05" title="Returning share by week">
          {byWeekTable("repeat_pct", sysShare, (v) => pct(v))}
        </Card>
        <Card num="06" title="Clients served by week">
          {byWeekTable("served", (w) => sysSum(w, "served"), num)}
        </Card>
      </div>

      <Card
        num="07"
        title="Lifetime retention"
        note={
          <>
            Active = seen within the branch&rsquo;s active window; lapsed = not seen since. F&S System customers come from the company record, so a
            client who visits two branches counts once; active and lapsed are not added across branches. Reviews are in the selected window.
          </>
        }
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Customers</th>
                <th>Came back</th>
                <th>Share</th>
                <th>Active</th>
                <th>Lapsed</th>
                <th>Window (days)</th>
                <th>Reviews</th>
                <th>Stars</th>
                <th>≤3★</th>
                <th>All-time stars</th>
              </tr>
            </thead>
            <tbody>
              {[...lifeRows, lifeSystem].map((r) => (
                <tr key={r.label} className={r === lifeSystem ? "total" : undefined}>
                  <td>{r.label}</td>
                  <td>{num(r.customers)}</td>
                  <td>{num(r.returning)}</td>
                  <td>{pct(r.share)}</td>
                  <td>{num(r.active)}</td>
                  <td>{num(r.lapsed)}</td>
                  <td>{num(r.lapse)}</td>
                  <td>{num(r.rc)}</td>
                  <td>{r.rc === 0 ? DASH : stars(r.rs)}</td>
                  <td>{num(r.low)}</td>
                  <td>{stars(r.all)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
