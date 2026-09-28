import type { ChannelWeek, N, Period, Sales } from "@/lib/types";
import { BRANCHES, DASH, day, div, name, peso, num, ratioPct, signedPct, sum } from "@/lib/format";
import { Card, SectionHead, Spark, Tag, type Tone } from "./ui";

type Field = keyof Omit<ChannelWeek, "we">;

function lookup(sales: Sales) {
  const map = new Map<string, Map<string, ChannelWeek>>();
  for (const c of sales.channels) map.set(c.channel, new Map(c.weeks.map((w) => [w.we, w])));
  return (channel: string, we: string | undefined, f: Field): N => {
    if (!we) return null;
    const v = map.get(channel)?.get(we)?.[f];
    return typeof v === "number" ? v : null;
  };
}

function indexTone(idx: N): Tone {
  if (idx === null) return "grey";
  if (idx >= 100) return "green";
  if (idx >= 90) return "amber";
  return "red";
}

function PaceTile({ title, p, kind }: { title: string; p: Period | undefined; kind: "barbershop" | "retail" }) {
  const actual = p ? p[kind] : null;
  const target = p ? (kind === "barbershop" ? p.target_barbershop : p.target_retail) : null;
  const basis = p ? (kind === "barbershop" ? p.basis_barbershop : p.basis_retail) : null;
  const elapsed = p?.elapsed ?? null;
  const length = p?.length ?? null;
  const paceFrac = elapsed !== null && length ? Math.min(1, elapsed / length) : null;
  const expected = target !== null && paceFrac !== null ? target * paceFrac : null;
  const index = div(actual, expected);
  const idx = index === null ? null : index * 100;
  const fill = div(actual, target);
  const daysLeft = elapsed !== null && length !== null ? length - elapsed : null;

  let needs: string;
  if (actual === null || target === null || daysLeft === null) needs = `Needs ${DASH}/day to land`;
  else if (actual >= target) needs = "Target landed";
  else if (daysLeft <= 0) needs = `Closed ${peso(target - actual)} short`;
  else needs = `Needs ${peso((target - actual) / daysLeft)}/day to land`;

  return (
    <div className="tile">
      <div className="tile-top">
        <span className="label">{title}</span>
        <Tag tone={indexTone(idx)}>{idx === null ? `Index ${DASH}` : `Index ${Math.round(idx)}`}</Tag>
      </div>
      <div className="tile-value">{peso(actual)}</div>
      <div className="meter" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(1, fill ?? 0)) * 100}%` }} />
        {paceFrac !== null ? <div className="meter-pace" style={{ left: `calc(${paceFrac * 100}% - 1px)` }} /> : null}
      </div>
      <div className="tile-sub muted small">
        Target {peso(target)}
        {basis && basis !== "approved" ? (
          <>
            {" "}
            <Tag tone="amber">{basis}</Tag>
          </>
        ) : null}
        <br />
        Day {elapsed ?? DASH} of {length ?? DASH} · {needs}
      </div>
    </div>
  );
}

export default function SalesSection({ sales }: { sales: Sales }) {
  const get = lookup(sales);
  const weeks = [...sales.weeks].sort();
  const sel = sales.end;
  const selIdx = weeks.indexOf(sel);
  const prior = selIdx > 0 ? weeks[selIdx - 1] : undefined;
  const month = sales.periods.find((p) => p.label === "month");
  const quarter = sales.periods.find((p) => p.label === "quarter");

  const systemNet = (we: string) => sum(BRANCHES.map((b) => get(b, we, "net")));

  // 03: retail channels in the total vs listed below
  const retailIn = [...BRANCHES, "SHP", "LZD", "TKT"];
  const retailOut = ["B2B", "EVENT"];
  const retailTotal = (we: string) => sum(retailIn.map((c) => get(c, we, "retail")));

  const weekHead = weeks.map((w) => (
    <th key={w} className={w === sel ? "" : ""}>
      {day(w)}
    </th>
  ));

  const seriesRow = (label: string, vals: N[], cls?: string) => (
    <tr key={label} className={cls}>
      <td>{label}</td>
      {vals.map((v, i) => (
        <td key={weeks[i]}>{peso(v)}</td>
      ))}
      <td>{peso(sum(vals))}</td>
      <td className="spark-cell">
        <Spark values={vals} />
      </td>
    </tr>
  );

  // 02 detail rows
  const detail = (code: string) => {
    const net = get(code, sel, "net");
    const prev = get(code, prior, "net");
    const chairs = get(code, sel, "chairs");
    return {
      net,
      vs: prev === null || net === null || prev === 0 ? null : ((net - prev) / prev) * 100,
      perChair: div(net, chairs),
      ft: get(code, sel, "ft"),
      arpu: get(code, sel, "arpu"),
      retail: get(code, sel, "retail"),
      buyers: get(code, sel, "buyers"),
      bav: get(code, sel, "bav"),
      bat: get(code, sel, "bat"),
      chairs,
      open: get(code, sel, "open"),
    };
  };
  const rows = BRANCHES.map((b) => ({ code: b, ...detail(b) }));
  const sysNet = sum(rows.map((r) => r.net));
  const sysPrev = prior ? systemNet(prior) : null;
  const sysChairs = sum(rows.map((r) => r.chairs));
  const sysFt = sum(rows.map((r) => r.ft));
  const system = {
    net: sysNet,
    vs: sysNet === null || sysPrev === null || sysPrev === 0 ? null : ((sysNet - sysPrev) / sysPrev) * 100,
    perChair: div(sysNet, sysChairs),
    ft: sysFt,
    arpu: div(sysNet, sysFt),
    retail: sum(rows.map((r) => r.retail)),
    buyers: sum(rows.map((r) => r.buyers)),
    bav: null as N,
    bat: null as N,
    chairs: sysChairs,
    open: sum(rows.map((r) => r.open)),
  };
  const detailRow = (label: string, r: typeof system, cls?: string) => (
    <tr key={label} className={cls}>
      <td>{label}</td>
      <td>{peso(r.net)}</td>
      <td className={r.vs === null ? "" : r.vs >= 0 ? "pos" : "neg"}>{signedPct(r.vs)}</td>
      <td>{peso(r.perChair)}</td>
      <td>{num(r.ft)}</td>
      <td>{peso(r.arpu)}</td>
      <td>{peso(r.retail)}</td>
      <td>{num(r.buyers)}</td>
      <td>{ratioPct(r.bav)}</td>
      <td>{ratioPct(r.bat)}</td>
      <td>{num(r.chairs)}</td>
      <td>{num(r.open)}</td>
    </tr>
  );

  const hab = sales.haberdashery;

  return (
    <section className="section" id="sales">
      <SectionHead
        id="sales-head"
        kicker="Sales"
        title="Sales"
        note={<>Barbershop net sales and retail against target. Data through {day(sales.data_through, true)}.</>}
      />

      <div className="tiles">
        <PaceTile title="Barbershop · month to date" p={month} kind="barbershop" />
        <PaceTile title="Barbershop · quarter to date" p={quarter} kind="barbershop" />
        <PaceTile title="Retail · month to date" p={month} kind="retail" />
        <PaceTile title="Retail · quarter to date" p={quarter} kind="retail" />
        <div className="tile">
          <div className="tile-top">
            <span className="label">Haberdashery</span>
            <Tag tone="grey">No feed</Tag>
          </div>
          <div className="tile-value">{DASH}</div>
          <div className="tile-sub muted small">
            No order feed in the database yet
            <br />
            Month target {peso(hab?.month_target ?? null)}
          </div>
        </div>
      </div>

      <Card num="01" title="Net sales by week" note="Barbershop net sales per shop. A total is — when any week or shop in it is missing.">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                {weekHead}
                <th>Window</th>
                <th className="l">Trend</th>
              </tr>
            </thead>
            <tbody>
              {BRANCHES.map((b) => seriesRow(name(b), weeks.map((w) => get(b, w, "net"))))}
              {seriesRow("F&S System", weeks.map((w) => systemNet(w)), "total")}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        num="02"
        title={`Branch detail · week ending ${day(sel, true)}`}
        note={
          <>
            Per chair = net ÷ chairs. Clients = foot traffic. BAV = barber availability (available ÷ chair-days); BAT = attendance (available ÷
            scheduled). {prior ? `Change is against week ending ${day(prior)}.` : "No prior week in this window."} BAV and BAT are not
            combined across branches.
          </>
        }
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Net</th>
                <th>vs prior wk</th>
                <th>Per chair</th>
                <th>Clients</th>
                <th>ARPU</th>
                <th>Retail</th>
                <th>Retail buyers</th>
                <th>BAV</th>
                <th>BAT</th>
                <th>Chairs</th>
                <th>Open days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => detailRow(name(r.code), r))}
              {detailRow("F&S System", system, "total")}
            </tbody>
          </table>
        </div>
      </Card>

      <Card num="03" title="Retail by week" note="Shops plus Shopee, Lazada and TikTok make the total. B2B and Events are listed below it and excluded.">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                {weekHead}
                <th>Window</th>
                <th className="l">Trend</th>
              </tr>
            </thead>
            <tbody>
              {retailIn.map((c) => seriesRow(name(c), weeks.map((w) => get(c, w, "retail"))))}
              {seriesRow("Retail total", weeks.map((w) => retailTotal(w)), "total")}
              <tr className="group">
                <td>Not in total</td>
                <td colSpan={weeks.length + 2} />
              </tr>
              {retailOut.map((c) => seriesRow(name(c), weeks.map((w) => get(c, w, "retail")), "sub"))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
