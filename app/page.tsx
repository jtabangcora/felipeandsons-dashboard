import { getWeeks, getSales, getCustomers, getTeam } from "@/lib/data";
import { dlong } from "@/lib/fmt";
import { Controls } from "@/components/Controls";
import { SalesSection } from "@/components/SalesSection";
import { CustomersSection } from "@/components/CustomersSection";
import { TeamSection } from "@/components/TeamSection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOGO = "https://fs-barber-portal-v2.vercel.app/fs-logo.png";

function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let weeks: string[] = [];
  try {
    weeks = await getWeeks();
  } catch (e) {
    return <div className="wrap"><div className="err">Could not reach F&amp;S Databases: {(e as Error).message}</div></div>;
  }
  const we = sp.we && weeks.includes(sp.we) ? sp.we : weeks[0];
  const nRaw = Number(sp.n);
  const n = [4, 8, 13, 26].includes(nRaw) ? nRaw : 8;

  const [sales, customers, team] = await Promise.all([getSales(we, n), getCustomers(we, n), getTeam(we, n)]);

  return (
    <>
      <header className="wrap top">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Felipe and Sons Barberdashery" />
          <div>
            <h1>F&amp;S Dashboard</h1>
            <div className="sub">Sales · Customers · Team · live from F&amp;S Databases</div>
          </div>
        </div>
        <Controls weeks={weeks} we={we} n={n} />
      </header>
      <nav className="nav">
        <div className="wrap">
          <a href="#sales">Sales</a>
          <a href="#customers">Customers</a>
          <a href="#team">Team</a>
          <span className="asof">Week ending {dlong(we)} · {n} weeks · data to {dlong(sales.data_through)}</span>
        </div>
      </nav>
      <main>
        <SalesSection d={sales} />
        <div className="wrap"><div className="divider" /></div>
        <CustomersSection d={customers} weeks={sales.weeks} />
        <div className="wrap"><div className="divider" /></div>
        <TeamSection d={team} today={manilaToday()} />
      </main>
      <footer className="wrap foot">
        Felipe and Sons Barberdashery · figures refresh hourly from Supabase · a dash means the source is missing a day, never zero
      </footer>
    </>
  );
}
