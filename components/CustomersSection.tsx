import type { Customers, N } from "@/lib/types";
import { num, pct, sumAll, dshort, dlong, BRANCH_NAME, DASH } from "@/lib/fmt";
import { Spark } from "./Spark";

export function CustomersSection({ d, weeks }: { d: Customers; weeks: string[] }) {
  const last = weeks.length - 1;
  const at = (b: Customers["branches"][number], i: number) => b.weeks[i];
  const served = weeks.map((_, i) => sumAll(d.branches.map((b) => at(b, i)?.served)));
  const newC = sumAll(d.branches.map((b) => at(b, last)?.new));
  const repC = sumAll(d.branches.map((b) => at(b, last)?.repeat));
  const repPct: N = newC != null && repC != null && newC + repC > 0 ? (100 * repC) / (newC + repC) : null;
  const revCount = d.branches.reduce((s, b) => s + (b.reviews?.count ?? 0), 0);
  const revStars = revCount
    ? d.branches.reduce((s, b) => s + (b.reviews?.stars ?? 0) * (b.reviews?.count ?? 0), 0) / revCount
    : null;

  return (
    <section className="section" id="customers">
      <div className="wrap">
        <h2>Customers</h2>
        <p className="lede">
          Who came, who came back, and what they said. Visits are Yodel kept bookings keyed by phone;
          walk-ins, booked and turn-downs come from the daily report.
        </p>

        <div className="tiles">
          <div className="tile">
            <div className="k"><span>Clients served · week</span></div>
            <div className="v">{num(served[last])}</div>
            <div className="s"><Spark values={served} w={180} h={26} /></div>
          </div>
          <div className="tile">
            <div className="k"><span>Returning share · week</span></div>
            <div className="v">{pct(repPct)}</div>
            <div className="s"><b>{num(repC)}</b> repeat · <b>{num(newC)}</b> new to F&amp;S</div>
          </div>
          <div className="tile">
            <div className="k"><span>Customers on record</span></div>
            <div className="v">{num(d.company.customers)}</div>
            <div className="s"><b>{pct(d.company.returning_pct)}</b> have come back at least once. Each customer counted once across the F&amp;S System.</div>
          </div>
          <div className="tile">
            <div className="k"><span>Google reviews · {d.n} weeks</span></div>
            <div className="v">{num(revCount)}</div>
            <div className="s">Average <b>{revStars == null ? DASH : revStars.toFixed(2)}</b> stars · data to {dlong(d.reviews_through)}</div>
          </div>
        </div>

        <div className="block">
          <h3><span className="num">04</span>Demand and visits<span className="aside">week ending {dlong(d.end)}</span></h3>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Branch</th><th>Served</th><th>New</th><th>Repeat</th><th>Returning</th>
                  <th>Walk-ins / Booked</th><th>Turn-downs</th><th>Cancelled</th><th>No-show</th><th>Retail conversion</th><th>Phone capture</th>
                </tr>
              </thead>
              <tbody>
                {d.branches.map((b) => {
                  const x = at(b, last);
                  return (
                    <tr key={b.branch}>
                      <td>{BRANCH_NAME[b.branch]}</td>
                      <td>{num(x?.served)}</td>
                      <td>{num(x?.new)}</td>
                      <td>{num(x?.repeat)}</td>
                      <td>{pct(x?.repeat_pct)}</td>
                      <td>{x?.walkins == null ? DASH : `${num(x.walkins)} / ${num(x.booked)}`}</td>
                      <td>{num(x?.turn_downs)}</td>
                      <td>{pct(x?.cancel_pct)}</td>
                      <td>{pct(x?.no_show_pct)}</td>
                      <td>{pct(x?.conversion_pct)}</td>
                      <td>{pct(x?.capture_pct)}</td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>F&amp;S System</td>
                  <td>{num(served[last])}</td>
                  <td>{num(newC)}</td>
                  <td>{num(repC)}</td>
                  <td>{pct(repPct)}</td>
                  <td>{(() => {
                    const w = sumAll(d.branches.map((b) => at(b, last)?.walkins));
                    const k = sumAll(d.branches.map((b) => at(b, last)?.booked));
                    return w == null || k == null ? DASH : `${num(w)} / ${num(k)}`;
                  })()}</td>
                  <td>{num(sumAll(d.branches.map((b) => at(b, last)?.turn_downs)))}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note">
            New means the first visit this phone number has ever made at any branch. Returning is repeat over new plus repeat.
            Retail conversion is retail tickets over clients served. Phone capture is the share of served bookings with a usable number:
            retention can only see customers it can key.
          </p>
        </div>

        <div className="grid2">
          <div className="block">
            <h3><span className="num">05</span>Returning share by week</h3>
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Branch</th>{weeks.slice(-6).map((w) => <th key={w}>{dshort(w)}</th>)}<th>Trend</th></tr>
                </thead>
                <tbody>
                  {d.branches.map((b) => {
                    const vals = b.weeks.map((x) => x.repeat_pct);
                    return (
                      <tr key={b.branch}>
                        <td>{BRANCH_NAME[b.branch]}</td>
                        {vals.slice(-6).map((v, i) => <td key={i}>{pct(v, 0)}</td>)}
                        <td><Spark values={vals} w={80} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="block">
            <h3><span className="num">06</span>Clients served by week</h3>
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Branch</th>{weeks.slice(-6).map((w) => <th key={w}>{dshort(w)}</th>)}<th>Trend</th></tr>
                </thead>
                <tbody>
                  {d.branches.map((b) => {
                    const vals = b.weeks.map((x) => x.served);
                    return (
                      <tr key={b.branch}>
                        <td>{BRANCH_NAME[b.branch]}</td>
                        {vals.slice(-6).map((v, i) => <td key={i}>{num(v)}</td>)}
                        <td><Spark values={vals} w={80} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="block">
          <h3><span className="num">07</span>Lifetime retention<span className="aside">every customer each branch has served, as at {dlong(d.end)}</span></h3>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Branch</th><th>Customers</th><th>Came back</th><th>Share</th>
                  <th>Active</th><th>Lapsed</th><th>Active window</th><th>Reviews ({d.n} wks)</th><th>Stars</th><th>3 stars or less</th><th>All-time stars</th>
                </tr>
              </thead>
              <tbody>
                {d.branches.map((b) => (
                  <tr key={b.branch}>
                    <td>{BRANCH_NAME[b.branch]}</td>
                    <td>{num(b.life?.customers)}</td>
                    <td>{num(b.life?.returning)}</td>
                    <td>{pct(b.life?.returning_pct)}</td>
                    <td>{num(b.life?.active)}</td>
                    <td>{num(b.life?.lapsed)}</td>
                    <td>{b.life?.lapse_days ? `${b.life.lapse_days} days` : DASH}</td>
                    <td>{num(b.reviews.count)}</td>
                    <td>{b.reviews.stars == null ? DASH : Number(b.reviews.stars).toFixed(2)}</td>
                    <td className={b.reviews.low > 0 ? "down" : "dim"}>{num(b.reviews.low)}</td>
                    <td>{b.reviews_all?.stars == null ? DASH : `${Number(b.reviews_all.stars).toFixed(2)} (${b.reviews_all.count})`}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>F&amp;S System</td>
                  <td>{num(d.company.customers)}</td>
                  <td>{num(d.company.returning)}</td>
                  <td>{pct(d.company.returning_pct)}</td>
                  <td colSpan={7}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note">
            Active is a last visit inside the branch&apos;s own window (its return interval times 1.5, floored at 45 days); lapsed is past that
            window but within a year. Windows exist from Q3 2026 only, so earlier weeks dash. The F&amp;S System row counts a customer once
            even when they visit two branches, so it is not the sum of the branches.
          </p>
        </div>
      </div>
    </section>
  );
}
