import { useEffect, useState } from "react";
import { get, type Meta, type SalesVsFuel, type ManRow, type ProvRow, type TrendRow } from "./lib/api.ts";
import { SERIES, INK } from "./lib/palette.ts";
import { LineChart, BarsH } from "./lib/charts.tsx";
import { ProvinceMap } from "./components/ProvinceMap.tsx";

const CLASS_LABEL: Record<string, string> = {
  cars: "Cars", ldv: "Bakkies / LDV", truck: "Trucks", minibus: "Minibuses",
  bus: "Buses", motorcycle: "Motorcycles", other: "Other", total_selfprop: "All vehicles",
};
const fmt = (n: number) => n.toLocaleString("en-ZA");

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: INK.muted }}>{label}</div>
      <div className="text-2xl font-extrabold mt-1 tnum" style={{ color: accent ?? INK.primary }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: INK.secondary }}>{sub}</div>}
    </div>
  );
}
function Panel({ title, note, children, right }:
  { title: string; note?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {note && <p className="text-xs mt-0.5" style={{ color: INK.muted }}>{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
function Select({ value, onChange, options }:
  { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="bg-[#111] border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none hover:border-white/25">
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

export default function App() {
  const [meta, setMeta] = useState<Meta>();
  const [svf, setSvf] = useState<SalesVsFuel>();
  const [manMonth, setManMonth] = useState<string>("");
  const [man, setMan] = useState<ManRow[]>([]);
  const [kind, setKind] = useState("new");
  const [vclass, setVclass] = useState("cars");
  const [prov, setProv] = useState<ProvRow[]>([]);
  const [sel, setSel] = useState<string | null>("GP");
  const [trend, setTrend] = useState<TrendRow[]>([]);

  useEffect(() => {
    get<Meta>("/api/meta").then((m) => {
      setMeta(m);
      setManMonth(m.salesMonths[m.salesMonths.length - 1]);
    });
    get<SalesVsFuel>("/api/sales-vs-fuel").then(setSvf);
  }, []);

  useEffect(() => {
    if (manMonth) get<ManRow[]>(`/api/manufacturers?limit=12&month=${manMonth}`).then(setMan);
  }, [manMonth]);

  useEffect(() => {
    get<ProvRow[]>(`/api/provinces?kind=${kind}&class=${vclass}`).then(setProv);
  }, [kind, vclass]);

  useEffect(() => {
    if (sel) get<TrendRow[]>(`/api/provinces/trend?code=${sel}&kind=${kind}&class=${vclass}`).then(setTrend);
  }, [sel, kind, vclass]);

  const latest = svf?.series[svf.series.length - 1];
  const yoy = svf && svf.series.length > 12
    ? ((latest!.passenger / svf.series[svf.series.length - 13].passenger - 1) * 100) : 0;
  const selName = meta?.provinces.find((p) => p.code === sel)?.name ?? sel;

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <header className="mb-6">
        <div className="text-[12px] tracking-[3px] uppercase font-bold" style={{ color: SERIES[0] }}>
          South Africa · Automotive Market Intelligence
        </div>
        <h1 className="text-3xl font-extrabold mt-1">New-vehicle sales, fuel &amp; registrations</h1>
        <p className="text-sm mt-1" style={{ color: INK.secondary }}>
          naamsa sales · DMRE fuel prices · NaTIS provincial registrations — ingested from source PDFs into PostgreSQL.
        </p>
      </header>

      {svf && latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Tile label="Passenger sales" value={fmt(latest.passenger)} sub={`${latest.period} · local`} />
          <Tile label="Year-on-year" value={`${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`}
            sub="vs same month last year" accent={yoy >= 0 ? "#0ca30c" : "#e66767"} />
          <Tile label="Petrol 95 (inland)" value={`R${latest.petrol95.toFixed(2)}`} sub={`${latest.period}`} />
          <Tile label="Sales ⇄ fuel corr." value={`${svf.correlation}`}
            sub={`${svf.months} months · weak link`} accent={SERIES[6]} />
        </div>
      )}

      <div className="grid gap-5">
        <Panel title="Sales vs fuel price — indexed to 100"
          note="Both rebased to 100 at the series start, so you compare movement, not scale. They barely track each other — SA sales growth is structural, not fuel-driven.">
          {svf && (
            <LineChart index height={320}
              series={[
                { name: "Passenger sales", color: SERIES[0], points: svf.series.map((s) => ({ x: s.period, y: s.passenger })) },
                { name: "Petrol 95", color: SERIES[1], points: svf.series.map((s) => ({ x: s.period, y: s.petrol95 })) },
              ]} />
          )}
        </Panel>

        <Panel title="Top manufacturers" note="Total local units (passenger + commercial)."
          right={meta && <Select value={manMonth} onChange={setManMonth}
            options={meta.salesMonths.slice().reverse().map((m) => ({ v: m, l: m }))} />}>
          <BarsH data={man.map((m) => ({ label: m.name, value: m.units }))} color={SERIES[0]} />
        </Panel>

        <Panel title="Provincial registrations"
          note={`NaTIS · ${kind === "new" ? "new" : "used"} · ${CLASS_LABEL[vclass]} · click a province`}
          right={
            <div className="flex gap-2">
              <Select value={kind} onChange={setKind} options={[{ v: "new", l: "New" }, { v: "used", l: "Used" }]} />
              <Select value={vclass} onChange={setVclass}
                options={Object.entries(CLASS_LABEL).map(([v, l]) => ({ v, l }))} />
            </div>}>
          <div className="grid md:grid-cols-2 gap-5">
            <ProvinceMap rows={prov} selected={sel} onSelect={setSel} />
            <div>
              <BarsH data={prov.map((p) => ({ label: p.name, value: p.units }))} color={SERIES[2]} />
              {sel && trend.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold mb-1">{selName} — monthly trend</div>
                  <LineChart height={180}
                    series={[{ name: selName!, color: SERIES[2], points: trend.map((t) => ({ x: t.period, y: t.units })) }]} />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <footer className="text-xs mt-8 pb-6" style={{ color: INK.muted }}>
        Sources: naamsa (The Automotive Business Council), DMRE via oilprices.co.za, NaTIS. Built with Python ingest → PostgreSQL → Node/TypeScript API → React.
      </footer>
    </div>
  );
}
