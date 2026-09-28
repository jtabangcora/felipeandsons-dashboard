import { Fragment } from "react";
import type { Team, Barber } from "@/lib/types";
import { peso, num, pct, dlong, BRANCH_NAME, DASH } from "@/lib/fmt";
import { Spark } from "./Spark";

const ORDER = ["BGC", "PPM", "POD", "LEV", "EROD"];

function daysLeft(iso: string | null, today: string): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86400000);
}

function Row({ b }: { b: Barber }) {
  const hit = b.arpu != null && b.arpu_target != null ? b.arpu >= b.arpu_target : null;
  return (
    <tr>
      <td>
        {b.barber}
        {b.role === "head" ? <> <span className="tag b">Head</span></> : null}
        {b.roving ? <> <span className="tag">Roving</span></> : null}
      </td>
      <td>{peso(b.net)}</td>
      <td>{num(b.clients)}</td>
      <td>{peso(b.arpu)}</td>
      <td>{hit == null ? <span className="dim">{DASH}</span> : <span className={`tag ${hit ? "g" : "a"}`}>{hit ? "On" : "Below"} {peso(b.arpu_target)}</span>}</td>
      <td>{pct(b.repeat_pct)}</td>
      <td>{peso(b.retail ?? (b.net != null ? 0 : null))}</td>
      <td>{b.praise > 0 ? num(b.praise) : <span className="dim">0</span>}</td>
      <td>{num(b.days)}</td>
      <td><Spark values={b.weeks.map((w) => w.net)} /></td>
    </tr>
  );
}

export function TeamSection({ d, today }: { d: Team; today: string }) {
  const barbers = d.barbers ?? [];
  const hiring = d.hiring ?? [];
  const byBranch = ORDER.map((br) => ({ br, rows: barbers.filter((b) => b.branch === br) })).filter((g) => g.rows.length);
  const withNet = barbers.filter((b) => b.net != null);
  const onTarget = withNet.filter((b) => b.arpu != null && b.arpu_target != null && b.arpu >= b.arpu_target).length;
  const gateMiss = Object.entries(d.gates ?? {}).flatMap(([br, ws]) => ws.filter((w) => !w.ok).map((w) => `${BRANCH_NAME[br]} ${dlong(w.we)}`));
  const overdue = hiring.filter((h) => { const x = daysLeft(h.fill_by, today); return x != null && x < 0; }).length;

  return (
    <section className="section" id="team">
      <div className="wrap">
        <h2>Team</h2>
        <p className="lede">
          Barber by barber over the last {d.n} weeks to {dlong(d.end)}. Sales are what the till credited to each barber;
          clients are his kept bookings in Yodel.
        </p>

        <div className="tiles">
          <div className="tile">
            <div className="k"><span>Barbers with a full record</span></div>
            <div className="v">{num(withNet.length)}</div>
            <div className="s">of {num(barbers.length)} on the roster who cut in this window</div>
          </div>
          <div className="tile">
            <div className="k"><span>At or above ARPU target</span></div>
            <div className="v">{num(onTarget)}</div>
            <div className="s">Targets by branch: BGC ₱1,000 · PPM ₱950 · POD ₱920 · LEV ₱960 · EROD ₱900</div>
          </div>
          <div className="tile">
            <div className="k"><span>Open seats</span>{overdue ? <span className="tag r">{overdue} overdue</span> : null}</div>
            <div className="v">{num(hiring.length)}</div>
            <div className="s">From the For Hire register. Detail below.</div>
          </div>
        </div>

        <div className="block">
          <h3><span className="num">08</span>Barbers<span className="aside">window totals; trend is weekly net sales</span></h3>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Barber</th><th>Net sales</th><th>Clients</th><th>ARPU</th><th>vs target</th>
                  <th>Returning</th><th>Retail</th><th>Praise</th><th>Days</th><th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {byBranch.map((g) => (
                  <Fragment key={g.br}>
                    <tr className="group"><td colSpan={10}>{BRANCH_NAME[g.br]}</td></tr>
                    {g.rows.map((b) => <Row key={g.br + b.barber} b={b} />)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            A branch-week publishes barber figures only when the sales ledger covers every open day and at least 95% of the week&apos;s value
            carries a barber&apos;s name. {gateMiss.length ? <>Held back this window: {gateMiss.join(", ")}.</> : <>Every branch-week in this window passed.</>}
            {" "}Returning is repeat visits to that barber over his new plus repeat clients. Praise counts Google reviews naming him, matched or
            confirmed. Roving barbers appear under each branch they worked.
          </p>
        </div>

        <div className="block">
          <h3><span className="num">09</span>Hiring<span className="aside">open seats by fill-by date</span></h3>
          <div className="tbl">
            <table>
              <thead><tr><th>Role</th><th>Branch</th><th>Type</th><th>Fill by</th><th>Days left</th></tr></thead>
              <tbody>
                {hiring.map((h, i) => {
                  const x = daysLeft(h.fill_by, today);
                  const cls = x == null ? "" : x < 0 ? "r" : x <= 14 ? "a" : "";
                  return (
                    <tr key={i}>
                      <td>{h.role}</td>
                      <td>{h.branch ? (BRANCH_NAME[h.branch] ?? h.branch) : DASH}</td>
                      <td>{h.type ?? DASH}</td>
                      <td>{h.fill_by ? dlong(h.fill_by) : h.status}</td>
                      <td>{x == null ? <span className="dim">{DASH}</span> : <span className={`tag ${cls}`}>{x < 0 ? `${-x} overdue` : `${x} days`}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">Days left counts from today in Manila, not from the selected week.</p>
        </div>
      </div>
    </section>
  );
}
