import type { Barber, N, Team } from "@/lib/types";
import { BRANCHES, DASH, day, daysBetween, manilaToday, name, num, peso, pct } from "@/lib/format";
import { Card, SectionHead, Spark, Tag, Tile } from "./ui";

const ROLE_ORDER: Record<string, number> = { head: 0, barber: 1, roving: 2 };

const pretty = (s: string) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : DASH);

export default function TeamSection({ team, weeks }: { team: Team; weeks: string[] }) {
  const barbers = team.barbers ?? [];
  const hiring = team.hiring ?? [];
  const today = manilaToday();

  const withNet = barbers.filter((b) => b.net !== null);
  const scored = barbers.filter((b) => b.arpu !== null && b.arpu_target !== null);
  const atTarget = scored.filter((b) => (b.arpu as number) >= (b.arpu_target as number));

  const hires = hiring
    .map((h) => ({ ...h, left: h.fill_by ? daysBetween(today, h.fill_by) : null }))
    .sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity) || a.role.localeCompare(b.role));
  const overdue = hires.filter((h) => h.left !== null && h.left < 0).length;

  const groups = [
    ...BRANCHES.map((b) => b as string),
    ...[...new Set(barbers.map((b) => b.branch))].filter((b) => !(BRANCHES as readonly string[]).includes(b)),
  ]
    .map((branch) => ({
      branch,
      rows: barbers
        .filter((b) => b.branch === branch)
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || (b.net ?? -1) - (a.net ?? -1)),
    }))
    .filter((g) => g.rows.length > 0);

  const spark = (b: Barber): N[] => {
    const m = new Map(b.weeks.map((w) => [w.we, w.net]));
    return weeks.map((w) => m.get(w) ?? null);
  };

  const failed = Object.entries(team.gates ?? {})
    .flatMap(([branch, list]) => list.filter((g) => !g.ok).map((g) => ({ branch, we: g.we })))
    .sort((a, b) => a.we.localeCompare(b.we) || BRANCHES.indexOf(a.branch as never) - BRANCHES.indexOf(b.branch as never));

  return (
    <section className="section" id="team">
      <SectionHead id="team-head" kicker="Team" title="Team" note={<>Barber figures cover the {team.n}-week window ending {day(team.end, true)}.</>} />

      <div className="tiles">
        <Tile
          label="Barbers with a full record"
          value={team.barbers ? `${withNet.length} / ${barbers.length}` : DASH}
          sub="One row per barber per branch; roving barbers count at each branch they worked."
        />
        <Tile
          label="At or above ARPU target"
          value={team.barbers ? `${atTarget.length} / ${scored.length}` : DASH}
          sub="Barbers with both an ARPU and a target."
        />
        <Tile
          label="Open seats"
          value={team.hiring ? num(hires.length) : DASH}
          tag={overdue > 0 ? <Tag tone="red">{overdue} overdue</Tag> : team.hiring ? <Tag tone="green">None overdue</Tag> : undefined}
          sub={`Days counted from today in Manila, ${day(today, true)}.`}
        />
      </div>

      <Card
        num="08"
        title="Barbers"
        note={
          team.gates === null ? (
            "No data gate information for this window."
          ) : failed.length === 0 ? (
            "Every branch-week in this window passed the data gate."
          ) : (
            <>
              Branch-weeks that failed the data gate, so barber figures there may be incomplete:{" "}
              {failed.map((f, i) => (
                <span key={`${f.branch}-${f.we}`}>
                  {i > 0 ? ", " : ""}
                  {name(f.branch)} w/e {day(f.we)}
                </span>
              ))}
              .
            </>
          )
        }
      >
        {team.barbers === null ? (
          <div className="card-empty">No barber data for this window.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Barber</th>
                  <th>Net</th>
                  <th>Clients</th>
                  <th>ARPU</th>
                  <th className="l">vs target</th>
                  <th>Returning</th>
                  <th>Retail</th>
                  <th>Praise</th>
                  <th>Days</th>
                  <th className="l">Weekly net</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => [
                  <tr key={`g-${g.branch}`} className="group">
                    <td>{name(g.branch)}</td>
                    <td colSpan={9} />
                  </tr>,
                  ...g.rows.map((b) => {
                    const on = b.arpu !== null && b.arpu_target !== null ? b.arpu >= b.arpu_target : null;
                    return (
                      <tr key={`${g.branch}-${b.barber}`}>
                        <td>
                          {b.barber}
                          {b.role === "head" || b.role === "roving" || b.roving || !b.complete ? (
                            <span className="tags">
                              {b.role === "head" ? <Tag tone="blue">Head</Tag> : null}
                              {b.role === "roving" || b.roving ? <Tag tone="grey">Roving</Tag> : null}
                              {!b.complete ? <Tag tone="amber">Partial</Tag> : null}
                            </span>
                          ) : null}
                        </td>
                        <td>{peso(b.net)}</td>
                        <td>{num(b.clients)}</td>
                        <td>{peso(b.arpu)}</td>
                        <td className="l">
                          {on === null ? (
                            <span className="muted">{DASH}</span>
                          ) : (
                            <Tag tone={on ? "green" : "red"}>
                              {on ? "On" : "Below"} {peso(b.arpu_target)}
                            </Tag>
                          )}
                        </td>
                        <td>{pct(b.repeat_pct)}</td>
                        <td>{peso(b.retail)}</td>
                        <td>{num(b.praise)}</td>
                        <td>{num(b.days)}</td>
                        <td className="spark-cell l">
                          <Spark values={spark(b)} />
                        </td>
                      </tr>
                    );
                  }),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card num="09" title="Hiring" note="Amber: due within 14 days. Red: past the fill-by date.">
        {team.hiring === null || hires.length === 0 ? (
          <div className="card-empty">{team.hiring === null ? "No hiring data." : "No open seats."}</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="l">Branch</th>
                  <th className="l">Type</th>
                  <th>Fill by</th>
                  <th className="l">Days left</th>
                </tr>
              </thead>
              <tbody>
                {hires.map((h, i) => (
                  <tr key={`${h.role}-${h.branch}-${i}`}>
                    <td>{h.role}</td>
                    <td className="l">{name(h.branch)}</td>
                    <td className="l">{pretty(h.type)}</td>
                    <td>{h.fill_by ? day(h.fill_by, true) : DASH}</td>
                    <td className="l">
                      {h.left === null ? (
                        <span className="muted">{DASH}</span>
                      ) : h.left < 0 ? (
                        <Tag tone="red">{-h.left} days overdue</Tag>
                      ) : h.left <= 14 ? (
                        <Tag tone="amber">{h.left} days</Tag>
                      ) : (
                        <>{h.left} days</>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
