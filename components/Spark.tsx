import type { N } from "@/lib/types";

/** Tiny column chart: one bar per week, a missing week is a gap, the last bar is emphasised. */
export function Spark({ values, w = 96, h = 22 }: { values: N[]; w?: number; h?: number }) {
  const known = values.filter((v): v is number => v !== null && v !== undefined);
  if (known.length === 0) return <span className="dim">{"—"}</span>;
  const max = Math.max(...known, 1);
  const gap = 2;
  const bw = Math.max(2, (w - gap * (values.length - 1)) / values.length);
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {values.map((v, i) => {
        if (v === null || v === undefined) return null;
        const bh = Math.max(1, (v / max) * (h - 1));
        return (
          <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={1}
            fill={i === values.length - 1 ? "var(--bar)" : "var(--bar-2)"} />
        );
      })}
    </svg>
  );
}
