import type { ReactNode } from "react";
import type { N } from "@/lib/types";

export type Tone = "green" | "red" | "amber" | "blue" | "grey";

export function Tag({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/** Tiny inline SVG column chart. Null = gap, last bar darker. */
export function Spark({ values, width = 72, height = 20 }: { values: N[]; width?: number; height?: number }) {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (values.length === 0 || nums.length === 0) return <span className="muted">—</span>;
  const max = Math.max(...nums, 0);
  const min = Math.min(...nums, 0);
  const range = max - min || 1;
  const gap = 2;
  const bw = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      {values.map((v, i) => {
        if (typeof v !== "number") return null;
        const h = Math.max(1, ((v - min) / range) * (height - 1));
        const last = i === values.length - 1;
        return (
          <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={1} className={last ? "spark-last" : "spark-bar"} />
        );
      })}
    </svg>
  );
}

export function SectionHead({ id, kicker, title, note }: { id: string; kicker: string; title: string; note?: ReactNode }) {
  return (
    <header className="section-head" id={id}>
      <div className="label">{kicker}</div>
      <h2>{title}</h2>
      {note ? <p className="muted small">{note}</p> : null}
    </header>
  );
}

export function Card({ num, title, note, children }: { num?: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        {num ? <span className="label num">{num}</span> : null}
        <h3>{title}</h3>
      </div>
      {children}
      {note ? <div className="card-note muted small">{note}</div> : null}
    </section>
  );
}

export function Tile({ label, value, sub, tag, children }: { label: string; value: ReactNode; sub?: ReactNode; tag?: ReactNode; children?: ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-top">
        <span className="label">{label}</span>
        {tag}
      </div>
      <div className="tile-value">{value}</div>
      {children}
      {sub ? <div className="tile-sub muted small">{sub}</div> : null}
    </div>
  );
}
