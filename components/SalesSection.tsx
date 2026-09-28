import type { Sales, Period, ChannelWeek, N } from "@/lib/types";
import { peso, num, pct, ratio, delta, sumAll, dshort, dlong, monthName, quarterName, BRANCH_NAME, DASH } from "@/lib/fmt";
import { Spark } from "./Spark";

const SHOPS = ["BGC", "PPM", "POD", "LEV", "EROD"];

function PaceTile({ title, actual, target, basis, p }: { title: string; actual: N; target: N; basis: string | null; p: Period }) {
  const pace = target != null ? (target * p.elapsed) / p.length : null;
  const idx = actual != null && pace ? (actual / pace) * 100 : null;
  const share = actual != null && target ? Math.min(100, (actual / target) * 100) : 0;
  const mark = (p.elapsed / p.length) * 100;
  const cls = idx == null ? "" : idx >= 100 ? "g" : idx >= 90 ? "a" : "r";
  const need = actual != null && target != null && p.elapsed < p.length ? (target - actual) / (p.length - p.elapsed) : null;
  return (
    <div className="tile">
      <div className="k"><span>{title}</span>{basis && basis !== "approved" ? <span className="tag a">{basis}</span> : null}</div>
      <div className="v">{peso(actual)}</div>
      <div className="meter" title="Share of target reached; the mark is where pace says it should be">
        <i style={{ width: `${share}%` }} /><u style={{ left: `${mark}%` }} />
      </div>
      <div className="s">
        {target != null ? <>of <b>{peso(target)}</b> · </> : <>No target set · </>}
        {idx != null ? <span className={`tag ${cls}`}>Index {idx.toFixed(0)}</span> : <span className="tag">Index {DASH}</span>}
      </div>
      <div className="s" style={{ marginTop: 6 }}>
        Day {p.elapsed} of {p.length}
        {need != null && need > 0 ? <> · needs <b>{peso(need)}</b>/day to land</> : null}
      </div>
    </div>
  );
}

export function SalesSection({ d }: { d: Sales }) {
  const month = d.periods.find((p) => p.label === "month")!;
  const quarter = d.periods.find((p) => p.label === "quarter")!;
  const shops = d.channels.filter((c) => c.kind === "shop");
  const others = d.channels.filter((c) => c.kind !== "shop");
  const last = d.weeks.length - 1;
  const wk = (c: { weeks: ChannelWeek[] }, i: number) => c.weeks[i];

  const systemNet = d.weeks.map((_, i) => sumAll(shops.map((c) => wk(c, i).net)));
  const systemFt = d.weeks.map((_, i) => sumAll(shops.map((c) => wk(c, i).ft)));
  const systemRetail = d.weeks.map((_, i) => sumAll(d.channels.filter((c) => c.kind !== "other").map((c) => wk(c, i).retail)));
  const windowTotal = (vals: N[]) => sumAll(vals);
  const hb = d.haberdashery;

  return (
    <section className="section" id="sales">
      <div className="wrap">
        <h2>Sales</h2>
        <p className="lede">
          Barbershop net sales and retail from the Daily Operations Report, week ending {dlong(d.end)}.
          A figure with a missing day behind it prints as a dash, never as a partial total.
        </p>

        <div className="tiles">
          <PaceTile title={`Barbershop · ${monthName(month.start)} to date`} actual={month.barbershop} target={month.target_barbershop} basis={month.basis_barbershop} p={month} />
          <PaceTile title={`Barbershop · ${quarterName(quarter.start)} to date`} actual={quarter.barbershop} target={quarter.target_barbershop} basis={quarter.basis_barbershop} p={quarter} />
          <PaceTile title={`Retail · ${monthName(month.start)} to date`} actual={month.retail} target={month.target_retail} basis={month.basis_retail} p={month} />
          <PaceTile title={`Retail · ${quarterName(quarter.start)} to date`} actual={quarter.retail} target={quarter.target_retail} basis={quarter.basis_retail} p={quarter} />
          <div className="tile">
            <div className="k"><span>Haberdashery · {monthName(month.start)}</span></div>
            <div className="v">{DASH}</div>
            <div className="s">Target <b>{peso(hb.month_target)}</b> a month.</div>
            <div className="s" style={{ marginTop: 6 }}>No order feed in the database yet. Orders live in the Haberdashery workbook.</div>
          </div>
        </div>

        <div className="block">
          <h3><span className="num">01</span>Net sales by week<span className="aside">barbershop services, net</span></h3>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  {d.weeks.map((w, i) => <th key={w} className={i === last ? "now" : ""}>{dshort(w)}</th>)}
                  <th>{d.n} weeks</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((c) => {
                  const vals = c.weeks.map((x) => x.net);
                  return (
                    <tr key={c.channel}>
                      <td>{BRANCH_NAME[c.channel]}</td>
                      {vals.map((v, i) => <td key={i} className={i === last ? "now" : ""}>{peso(v)}</td>)}
                      <td>{peso(windowTotal(vals))}</td>
                      <td><Spark values={vals} /></td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>F&amp;S System</td>
                  {systemNet.map((v, i) => <td key={i}>{peso(v)}</td>)}
                  <td>{peso(windowTotal(systemNet))}</td>
                  <td><Spark values={systemNet} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="block">
          <h3><span className="num">02</span>Branch detail<span className="aside">week ending {dlong(d.end)}, change against the week before</span></h3>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Branch</th><th>Net sales</th><th>vs prior</th><th>Per chair</th><th>Clients</th><th>ARPU</th>
                  <th>Retail</th><th>Retail buyers</th><th>BAV</th><th>BAT</th><th>Chairs</th><th>Open days</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((c) => {
                  const x = c.weeks[last];
                  const prev = last > 0 ? c.weeks[last - 1] : null;
                  const dv = delta(x.net, prev?.net ?? null);
                  return (
                    <tr key={c.channel}>
                      <td>{BRANCH_NAME[c.channel]}</td>
                      <td>{peso(x.net)}</td>
                      <td className={dv == null ? "dim" : dv >= 0 ? "up" : "down"}>{dv == null ? DASH : (dv >= 0 ? "+" : "") + dv.toFixed(1) + "%"}</td>
                      <td>{x.net != null && x.chairs ? peso(x.net / x.chairs) : DASH}</td>
                      <td>{num(x.ft)}</td>
                      <td>{peso(x.arpu)}</td>
                      <td>{peso(x.retail)}</td>
                      <td>{num(x.buyers)}</td>
                      <td>{ratio(x.bav)}</td>
                      <td>{ratio(x.bat)}</td>
                      <td>{num(x.chairs)}</td>
                      <td>{num(x.open)}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const net = systemNet[last], ft = systemFt[last];
                  const prev = last > 0 ? systemNet[last - 1] : null;
                  const dv = delta(net, prev);
                  const chairs = sumAll(shops.map((c) => c.weeks[last].chairs));
                  const retail = sumAll(shops.map((c) => c.weeks[last].retail));
                  const buyers = sumAll(shops.map((c) => c.weeks[last].buyers));
                  return (
                    <tr className="total">
                      <td>F&amp;S System</td>
                      <td>{peso(net)}</td>
                      <td className={dv == null ? "dim" : dv >= 0 ? "up" : "down"}>{dv == null ? DASH : (dv >= 0 ? "+" : "") + dv.toFixed(1) + "%"}</td>
                      <td>{net != null && chairs ? peso(net / chairs) : DASH}</td>
                      <td>{num(ft)}</td>
                      <td>{net != null && ft ? peso(net / ft) : DASH}</td>
                      <td>{peso(retail)}</td>
                      <td>{num(buyers)}</td>
                      <td></td><td></td>
                      <td>{num(chairs)}</td>
                      <td></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
          <p className="note">
            Per chair is the benchmark between branches: net sales over chairs. BAV is barber-days available over chair-days on open days;
            BAT is barber-days available over barber-days scheduled. BGC is counted at 12 chairs. ARPU is net sales over clients served.
          </p>
        </div>

        <div className="block">
          <h3><span className="num">03</span>Retail net sales by week<span className="aside">in-branch plus marketplaces</span></h3>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  {d.weeks.map((w, i) => <th key={w} className={i === last ? "now" : ""}>{dshort(w)}</th>)}
                  <th>{d.n} weeks</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {[...shops, ...others.filter((c) => c.kind === "ecom")].map((c) => {
                  const vals = c.weeks.map((x) => x.retail);
                  return (
                    <tr key={c.channel}>
                      <td>{BRANCH_NAME[c.channel]}</td>
                      {vals.map((v, i) => <td key={i} className={i === last ? "now" : ""}>{peso(v)}</td>)}
                      <td>{peso(windowTotal(vals))}</td>
                      <td><Spark values={vals} /></td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>Retail total</td>
                  {systemRetail.map((v, i) => <td key={i}>{peso(v)}</td>)}
                  <td>{peso(windowTotal(systemRetail))}</td>
                  <td><Spark values={systemRetail} /></td>
                </tr>
                <tr className="group"><td colSpan={d.weeks.length + 3}>Other channels, not in the retail total</td></tr>
                {others.filter((c) => c.kind === "other").map((c) => {
                  const vals = c.weeks.map((x) => x.retail);
                  return (
                    <tr key={c.channel}>
                      <td>{BRANCH_NAME[c.channel]}</td>
                      {vals.map((v, i) => <td key={i} className={i === last ? "now" : ""}>{peso(v)}</td>)}
                      <td>{peso(windowTotal(vals))}</td>
                      <td><Spark values={vals} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">Watsons has no feed. B2B and Events are recorded monthly and stop at the last loaded month.</p>
        </div>
      </div>
    </section>
  );
}
