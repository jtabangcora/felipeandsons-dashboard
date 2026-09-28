"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const WINDOWS = [4, 8, 13, 26];

export default function Controls({ weeks, we, n }: { weeks: { value: string; label: string }[]; we: string; n: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (nextWe: string, nextN: number) =>
    start(() => router.push(`/?we=${encodeURIComponent(nextWe)}&n=${nextN}`));

  return (
    <div className={`controls${pending ? " is-pending" : ""}`}>
      <label>
        <span className="label">Week ending</span>
        <select value={we} onChange={(e) => go(e.target.value, n)} disabled={weeks.length === 0}>
          {weeks.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Window</span>
        <select value={n} onChange={(e) => go(we, Number(e.target.value))}>
          {WINDOWS.map((w) => (
            <option key={w} value={w}>
              {w} weeks
            </option>
          ))}
        </select>
      </label>
      {pending ? <span className="label muted">Loading…</span> : null}
    </div>
  );
}
