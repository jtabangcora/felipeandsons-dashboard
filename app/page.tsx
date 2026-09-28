import Controls from "./Controls";
import SalesSection from "@/components/SalesSection";
import CustomersSection from "@/components/CustomersSection";
import TeamSection from "@/components/TeamSection";
import { getCustomers, getSales, getTeam, getWeeks } from "@/lib/data";
import { day } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOWS = [4, 8, 13, 26];

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Failed({ id, title, err }: { id: string; title: string; err: unknown }) {
  console.error(`[${id}]`, err);
  return (
    <section className="section" id={id}>
      <header className="section-head">
        <div className="label">{title}</div>
        <h2>{title}</h2>
      </header>
      <div className="error">Could not load {title.toLowerCase()} data. Try again shortly.</div>
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;

  let weeks: string[] = [];
  let weeksErr: unknown = null;
  try {
    weeks = await getWeeks();
  } catch (e) {
    weeksErr = e;
  }

  const wantWe = one(sp.we);
  const we = wantWe && weeks.includes(wantWe) ? wantWe : weeks[0];
  const wantN = Number(one(sp.n));
  const n = WINDOWS.includes(wantN) ? wantN : 8;

  const [sales, cust, team] = we
    ? await Promise.allSettled([getSales(we, n), getCustomers(we, n), getTeam(we, n)])
    : [null, null, null];

  const salesOk = sales?.status === "fulfilled" ? sales.value : null;
  const dataThrough = salesOk?.data_through ?? null;
  const windowWeeks = salesOk ? [...salesOk.weeks].sort() : [];

  return (
    <>
      <header className="top">
        <div className="wrap top-inner">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://fs-barber-portal-v2.vercel.app/fs-logo.png" alt="Felipe and Sons" width={40} height={40} />
            <div>
              <div className="label">Felipe and Sons</div>
              <h1>F&amp;S Dashboard</h1>
            </div>
          </div>
          {we ? <Controls weeks={weeks.map((w) => ({ value: w, label: day(w, true) }))} we={we} n={n} /> : null}
        </div>
      </header>

      <nav className="nav" aria-label="Sections">
        <div className="wrap nav-inner">
          <div className="nav-links">
            <a href="#sales">Sales</a>
            <a href="#customers">Customers</a>
            <a href="#team">Team</a>
          </div>
          {we ? (
            <span className="label">
              Week ending {day(we, true)} · {n} weeks · data to {day(dataThrough, true)}
            </span>
          ) : null}
        </div>
      </nav>

      <main className="wrap">
        {!we ? (
          <div className="error">{weeksErr ? "Could not reach the database. Try again shortly." : "No complete weeks in the database yet."}</div>
        ) : (
          <>
            {sales?.status === "fulfilled" ? <SalesSection sales={sales.value} /> : <Failed id="sales" title="Sales" err={sales?.reason} />}
            {cust?.status === "fulfilled" ? (
              <CustomersSection cust={cust.value} />
            ) : (
              <Failed id="customers" title="Customers" err={cust?.reason} />
            )}
            {team?.status === "fulfilled" ? (
              <TeamSection team={team.value} weeks={windowWeeks.length ? windowWeeks : [...new Set((team.value.barbers ?? []).flatMap((b) => b.weeks.map((w) => w.we)))].sort()} />
            ) : (
              <Failed id="team" title="Team" err={team?.reason} />
            )}
          </>
        )}
        <footer className="foot muted small">
          Felipe and Sons · F&amp;S System = BGC, Power Plant, Podium, Leviste and E. Rodriguez. — means the figure is missing, never zero.
          Figures refresh hourly.
        </footer>
      </main>
    </>
  );
}
