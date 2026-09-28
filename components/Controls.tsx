"use client";
import { useRouter } from "next/navigation";

export function Controls({ weeks, we, n }: { weeks: string[]; we: string; n: number }) {
  const router = useRouter();
  const go = (w: string, k: number) => router.push(`/?we=${w}&n=${k}`);
  const label = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
  };
  return (
    <form className="controls" action="/" method="get" onSubmit={(e) => e.preventDefault()}>
      <label>
        Week ending
        <select name="we" value={we} onChange={(e) => go(e.target.value, n)}>
          {weeks.map((w) => (
            <option key={w} value={w}>{label(w)}</option>
          ))}
        </select>
      </label>
      <label>
        Window
        <select name="n" value={n} onChange={(e) => go(we, Number(e.target.value))}>
          {[4, 8, 13, 26].map((k) => (
            <option key={k} value={k}>{k} weeks</option>
          ))}
        </select>
      </label>
    </form>
  );
}
