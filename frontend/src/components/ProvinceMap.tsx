import { useState } from "react";
import mapData from "../sa-provinces.json";
import { blueScale, INK } from "../lib/palette.ts";
import type { ProvRow } from "../lib/api.ts";

export function ProvinceMap({ rows, selected, onSelect }:
  { rows: ProvRow[]; selected: string | null; onSelect: (code: string) => void }) {
  const [hover, setHover] = useState<ProvRow | null>(null);
  const byCode: Record<string, ProvRow> = Object.fromEntries(rows.map((r) => [r.code, r]));
  const max = Math.max(...rows.map((r) => r.units), 1);
  const { width, height, provinces } = mapData as any;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {provinces.map((p: any) => {
          const row = byCode[p.code];
          const t = row ? row.units / max : 0;
          const isSel = selected === p.code;
          return (
            <path key={p.code} d={p.d}
              fill={row ? blueScale(t) : "rgba(255,255,255,0.05)"}
              stroke={isSel ? "#b6ff00" : "rgba(255,255,255,0.18)"}
              strokeWidth={isSel ? 2.5 : 1}
              className="cursor-pointer transition-[fill] duration-150"
              onMouseEnter={() => setHover(row ?? null)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(p.code)} />
          );
        })}
        {provinces.map((p: any) => (
          <text key={p.code + "l"} x={p.cx} y={p.cy} textAnchor="middle" fontSize="13"
            fontWeight="700" fill="#fff" pointerEvents="none"
            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.55)", strokeWidth: 3 }}>
            {p.code}
          </text>
        ))}
      </svg>
      {hover && (
        <div className="absolute top-2 left-2 rounded-lg border border-white/10 bg-[#17171b]/90 backdrop-blur-sm px-3 py-2 text-xs pointer-events-none">
          <div className="font-semibold text-white">{hover.name}</div>
          <div className="tabular-nums" style={{ color: INK.secondary }}>
            {hover.units.toLocaleString("en-ZA")} · {hover.pct}%
          </div>
        </div>
      )}
    </div>
  );
}
