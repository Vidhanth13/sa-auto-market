import { useRef, useState } from "react";
import { INK } from "./palette.ts";

type Pt = { x: string; y: number };
export type Series = { name: string; color: string; points: Pt[] };

const fmt = (n: number) => n.toLocaleString("en-ZA");

/** Multi-line chart. Pass `index` to rebase each series to 100 at its first point. */
export function LineChart({ series, height = 300, index = false, yLabel }:
  { series: Series[]; height?: number; index?: boolean; yLabel?: string }) {
  const W = 820, H = height, padL = 48, padR = 16, padT = 16, padB = 34;
  const [hi, setHi] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const xs = series[0]?.points.map((p) => p.x) ?? [];
  const n = xs.length;
  const data = series.map((s) => {
    const base = index ? (s.points[0]?.y || 1) : 1;
    return { ...s, vals: s.points.map((p) => (index ? (p.y / base) * 100 : p.y)) };
  });
  const allY = data.flatMap((s) => s.vals);
  const yMin = index ? Math.min(100, ...allY) : 0;
  const yMax = Math.max(...allY, 1);
  const pad = (yMax - yMin) * 0.08 || 1;
  const lo = yMin - pad, span = (yMax + pad) - lo;

  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const Y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const ticks = 4;
  const gl = Array.from({ length: ticks + 1 }, (_, i) => lo + (span * i) / ticks);

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
           onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        {gl.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={Y(g)} y2={Y(g)} stroke={INK.grid} strokeWidth={1} />
            <text x={padL - 8} y={Y(g) + 4} textAnchor="end" fontSize="11" fill={INK.muted} className="tnum">
              {index ? Math.round(g) : fmt(Math.round(g))}
            </text>
          </g>
        ))}
        {xs.map((x, i) => (i % Math.ceil(n / 8) === 0 || i === n - 1) && (
          <text key={i} x={X(i)} y={H - 12} textAnchor="middle" fontSize="10" fill={INK.muted}>{x}</text>
        ))}
        {data.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round"
            points={s.vals.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} />
        ))}
        {hi !== null && (
          <>
            <line x1={X(hi)} x2={X(hi)} y1={padT} y2={H - padB} stroke={INK.axis} strokeWidth={1} />
            {data.map((s) => (
              <circle key={s.name} cx={X(hi)} cy={Y(s.vals[hi])} r={4} fill={s.color}
                stroke={INK.surface} strokeWidth={2} />
            ))}
          </>
        )}
      </svg>
      {hi !== null && (
        <div className="absolute top-2 right-4 card px-3 py-2 text-xs pointer-events-none"
             style={{ borderColor: "rgba(255,255,255,.14)" }}>
          <div className="text-[11px] mb-1" style={{ color: INK.muted }}>{xs[hi]}</div>
          {data.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: 9, background: s.color }} className="inline-block" />
              <span style={{ color: INK.secondary }}>{s.name}</span>
              <span className="tnum ml-auto font-semibold">
                {index ? (s.vals[hi]).toFixed(1) : fmt(Math.round(s.vals[hi]))}
                {index ? "" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-4 mt-2 px-2 text-xs">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5" style={{ color: INK.secondary }}>
            <span style={{ width: 10, height: 10, borderRadius: 9, background: s.color }} className="inline-block" />
            {s.name}
          </span>
        ))}
        {yLabel && <span className="ml-auto" style={{ color: INK.muted }}>{yLabel}</span>}
      </div>
    </div>
  );
}

/** Horizontal bars, sorted as given. */
export function BarsH({ data, color, max }:
  { data: { label: string; value: number }[]; color: string; max?: number }) {
  const top = max ?? Math.max(...data.map((d) => d.value), 1);
  const [hi, setHi] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 group"
             onMouseEnter={() => setHi(d.label)} onMouseLeave={() => setHi(null)}>
          <div className="w-40 truncate text-xs text-right" style={{ color: INK.secondary }}>{d.label}</div>
          <div className="flex-1 h-5 relative">
            <div className="h-5 rounded-[4px]" style={{
              width: `${(d.value / top) * 100}%`, background: color,
              opacity: hi && hi !== d.label ? 0.5 : 1, transition: "opacity .12s" }} />
          </div>
          <div className="w-16 text-xs tnum text-right font-semibold">{fmt(d.value)}</div>
        </div>
      ))}
    </div>
  );
}
