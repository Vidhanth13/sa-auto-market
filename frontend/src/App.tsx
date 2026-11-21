import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { curveNatural } from "@visx/curve";
import { get, type Meta, type SalesVsFuel, type ManRow, type ManTrendRow, type ProvRow, type TrendRow } from "./lib/api.ts";
import { SERIES, INK } from "./lib/palette.ts";
import { AreaChart, Area, Grid, XAxis, ChartTooltip } from "@/charts";
import ShimmerText from "@/components/kokonutui/shimmer-text";
import { ProvinceMap } from "./components/ProvinceMap.tsx";

const CLASS_LABEL: Record<string, string> = {
  cars: "Cars", ldv: "Bakkies / LDV", truck: "Trucks", minibus: "Minibuses",
  bus: "Buses", motorcycle: "Motorcycles", other: "Other", total_selfprop: "All vehicles",
};
const fmt = (n: number) => Math.round(n).toLocaleString("en-ZA");
const monthDate = (m: string) => new Date(m + "-01T00:00:00");
const monthLabel = (m: string) =>
  monthDate(m).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

/* ---------- shared shells ---------- */
function Reveal({ children, delay = 0, className = "" }:
  { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={"rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm transition-colors hover:border-lime-300/25 " + className}>
    {children}
  </div>
);
function Tile({ label, value, sub, accent }:
  { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl sm:text-3xl font-extrabold" style={{ color: accent ?? "#fff" }}>{value}</span>
      </div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </Card>
  );
}
function Panel({ title, note, children, right }:
  { title: string; note?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {note && <p className="text-[11px] text-zinc-500 mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}
const fieldCls = "rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-lime-300/50 hover:border-white/25";
function Select({ value, onChange, options, label }:
  { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; label?: string }) {
  return (
    <label className="flex items-center gap-1.5">
      {label && <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>}
      <select className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}
/* segmented toggle (New / Used) */
function Segmented({ value, onChange, options }:
  { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            className="relative rounded-md px-3 py-1 text-xs font-medium transition-colors"
            style={{ color: on ? "#0a0a0b" : "#a1a1aa" }}>
            {on && <motion.span layoutId="seg" className="absolute inset-0 rounded-md bg-lime-300"
              transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <span className="relative">{o.l}</span>
          </button>
        );
      })}
    </div>
  );
}
/* horizontal ranking bars */
function RankBars({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <motion.div key={d.label} className="flex items-center gap-3"
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.025, 0.3) }}>
          <div className="w-28 shrink-0 truncate text-xs text-zinc-300" title={d.label}>{d.label}</div>
          <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
            <motion.div className="absolute inset-y-0 left-0 rounded-md"
              style={{ background: color, opacity: 0.85 }}
              initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: Math.min(i * 0.025, 0.3) }} />
          </div>
          <div className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-white">{fmt(d.value)}</div>
        </motion.div>
      ))}
    </div>
  );
}

/* atmospheric backdrop (CSS/SVG only) */
function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{
        background:
          "radial-gradient(1100px 700px at 82% -12%, rgba(183,255,0,0.12), transparent 60%)," +
          "radial-gradient(900px 700px at -8% 4%, rgba(56,189,248,0.09), transparent 58%)," +
          "radial-gradient(760px 520px at 50% 112%, rgba(129,140,248,0.07), transparent 60%)," +
          "linear-gradient(180deg, #07080a 0%, #060708 60%, #050506 100%)",
      }} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="road" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" /><stop offset="60%" stopColor="#a3e635" /><stop offset="100%" stopColor="#b7ff00" />
          </linearGradient>
          <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        </defs>
        <g fill="none" stroke="rgba(163,230,53,0.08)" strokeWidth="1.5">
          {[70, 140, 215, 300].map((r) => <circle key={r} cx="1220" cy="120" r={r} />)}
        </g>
        <path d="M-40 680 C 240 600, 320 440, 540 470 S 860 660, 1010 500 S 1260 240, 1520 320"
          fill="none" stroke="url(#road)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 16" opacity="0.4" />
        <rect width="100%" height="100%" filter="url(#grain)" opacity="0.045" />
      </svg>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState<Meta>();
  const [svf, setSvf] = useState<SalesVsFuel>();
  // manufacturer date range
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [man, setMan] = useState<ManRow[]>([]);
  const [manTrend, setManTrend] = useState<ManTrendRow[]>([]);
  // provincial
  const [kind, setKind] = useState("new");
  const [vclass, setVclass] = useState("cars");
  const [pfrom, setPfrom] = useState("");
  const [pto, setPto] = useState("");
  const [prov, setProv] = useState<ProvRow[]>([]);
  const [sel, setSel] = useState<string | null>("GP");
  const [trend, setTrend] = useState<TrendRow[]>([]);

  useEffect(() => {
    get<Meta>("/api/meta").then((m) => {
      setMeta(m);
      const months = m.salesMonths;
      const start2026 = months.find((x) => x >= "2026-01") ?? months[0];
      setFrom(start2026);
      setTo(months[months.length - 1]);
      const nm = m.natisMonths;
      setPfrom(nm.find((x) => x >= "2026-01") ?? nm[0]);
      setPto(nm[nm.length - 1]);
    });
    get<SalesVsFuel>("/api/sales-vs-fuel").then(setSvf);
  }, []);

  // ranking over the range
  useEffect(() => {
    if (from && to) get<ManRow[]>(`/api/manufacturers?limit=10&from=${from}&to=${to}`).then(setMan);
  }, [from, to]);

  // trend lines for the top brands over the range
  useEffect(() => {
    if (!from || !to || man.length === 0) return;
    const names = man.slice(0, 6).map((m) => m.name);
    get<ManTrendRow[]>(`/api/manufacturers?from=${from}&to=${to}&names=${encodeURIComponent(names.join(","))}`)
      .then(setManTrend);
  }, [from, to, man]);

  useEffect(() => {
    if (pfrom && pto) get<ProvRow[]>(`/api/provinces?kind=${kind}&class=${vclass}&from=${pfrom}&to=${pto}`).then(setProv);
  }, [kind, vclass, pfrom, pto]);
  useEffect(() => {
    if (sel) get<TrendRow[]>(`/api/provinces/trend?code=${sel}&kind=${kind}&class=${vclass}`).then(setTrend);
  }, [sel, kind, vclass]);

  /* ---- derived ---- */
  const latest = svf?.series[svf.series.length - 1];
  const yoy = svf && svf.series.length > 12
    ? ((latest!.passenger / svf.series[svf.series.length - 13].passenger - 1) * 100) : 0;
  const selName = meta?.provinces.find((p) => p.code === sel)?.name ?? sel;

  // sales vs fuel, indexed to 100
  const svfData = useMemo(() => {
    if (!svf) return [];
    const s0 = svf.series[0].passenger, f0 = svf.series[0].petrol95;
    return svf.series.map((s) => ({
      date: monthDate(s.period),
      Sales: (s.passenger / s0) * 100,
      Petrol: (s.petrol95 / f0) * 100,
    }));
  }, [svf]);

  // manufacturer trend matrix (0-filled so climbers rise from the baseline)
  const topBrands = useMemo(() => man.slice(0, 6).map((m) => m.name), [man]);
  const manTrendData = useMemo(() => {
    if (manTrend.length === 0) return [];
    const months = [...new Set(manTrend.map((r) => r.period))].sort();
    return months.map((p) => {
      const row: Record<string, unknown> = { date: monthDate(p) };
      for (const b of topBrands) row[b] = 0;
      for (const r of manTrend.filter((x) => x.period === p)) row[r.name] = r.units;
      return row;
    });
  }, [manTrend, topBrands]);

  const provTrendData = useMemo(
    () => trend.map((t) => ({ date: monthDate(t.period), Registrations: t.units })),
    [trend]);

  const monthOpts = (meta?.salesMonths ?? []).map((m) => ({ v: m, l: monthLabel(m) }));
  const natisMonthOpts = (meta?.natisMonths ?? []).map((m) => ({ v: m, l: monthLabel(m) }));
  const rangeMonths = man[0]?.months;
  const provTotal = prov.reduce((a, p) => a + p.units, 0);

  return (
    <div className="relative min-h-svh w-full overflow-x-hidden text-zinc-200">
      <Background />
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        {/* header */}
        <header className="pt-10 sm:pt-14">
          <Reveal>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-lime-300" />
              South Africa · Automotive Market Intelligence
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <ShimmerText text="The South African car market, in data."
              className="!text-4xl sm:!text-6xl !font-extrabold !tracking-tight text-left" />
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-4 max-w-2xl rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm leading-relaxed text-zinc-400">
              <span className="font-semibold text-zinc-200">For the Pinewood AI team.</span>{" "}
              A small end-to-end project I built to show how I move data from A to B. Python pulls South African
              vehicle data straight from naamsa, DMRE and NaTIS source PDFs, loads it into PostgreSQL, a Node and
              TypeScript API serves it, and this React dashboard reads it. It turns scattered government and industry
              documents into one live view of the local car market: new vehicle sales against fuel prices,
              brand by brand trends, and registrations across all nine provinces. The point is a clean, queryable
              pipeline and a product people can actually read, the same shape of work a dealer management platform runs on.
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="https://github.com/Vidhanth13/sa-auto-market" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-lime-300/50 hover:text-white">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                  View source on GitHub
                </a>
              </div>
            </div>
          </Reveal>
        </header>

        {/* stat tiles */}
        {svf && latest && (
          <section className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[
              <Tile key="a" label="Passenger sales" value={fmt(latest.passenger)} sub={`${monthLabel(latest.period)} · local`} />,
              <Tile key="b" label="Year on year" value={`${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`} sub="vs same month last year" accent={yoy >= 0 ? "#b6ff00" : "#fb7185"} />,
              <Tile key="c" label="Petrol 95 inland" value={`R${latest.petrol95.toFixed(2)}`} sub={monthLabel(latest.period)} />,
              <Tile key="d" label="Sales vs fuel corr." value={`${svf.correlation}`} sub={`${svf.months} months · weak link`} accent="#38bdf8" />,
            ].map((t, i) => <Reveal key={i} delay={0.05 * i}>{t}</Reveal>)}
          </section>
        )}

        <div className="mt-6 grid gap-5">
          {/* sales vs fuel */}
          <Reveal>
            <Panel title="Sales vs fuel price, indexed to 100"
              note="Both rebased to 100 at the start, so you compare movement not scale. They barely track each other: SA sales growth is structural, not fuel driven.">
              {svfData.length > 0 && (
                <AreaChart data={svfData} animationDuration={1100} className="h-[300px] w-full">
                  <Grid horizontal />
                  <Area dataKey="Sales" curve={curveNatural} stroke={SERIES[0]} fill={SERIES[0]} strokeWidth={2.5} fillOpacity={0.18} />
                  <Area dataKey="Petrol" curve={curveNatural} stroke={SERIES[1]} fill={SERIES[1]} strokeWidth={2} fillOpacity={0.08} />
                  <XAxis />
                  <ChartTooltip />
                </AreaChart>
              )}
              <Legend items={[{ c: SERIES[0], l: "Passenger sales" }, { c: SERIES[1], l: "Petrol 95" }]} />
              <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-300">What this shows: </span>
                passenger sales have climbed well ahead of the fuel price, so growth is not being driven by cheaper petrol.
                Through the April and May fuel spike both lines rose together, sales kept going even as fuel jumped,
                which is why the correlation stays weak. The open question is the lagged effect: whether that higher
                fuel price eventually drags on vehicle sales. That is the data we are still waiting on.
              </p>
            </Panel>
          </Reveal>

          {/* top manufacturers with date range */}
          <Reveal>
            <Panel title="Top manufacturers"
              note={`Total local units added over the window${rangeMonths ? ` · ${rangeMonths} months` : ""}.`}
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <Select label="From" value={from} onChange={setFrom} options={monthOpts} />
                  <Select label="To" value={to} onChange={setTo} options={monthOpts} />
                </div>}>
              {/* ranking bars — own section on top */}
              <div className="mb-2 text-[11px] text-zinc-500">Units added over the window · ranked</div>
              <RankBars data={man.map((m) => ({ label: m.name, value: m.units }))} color={SERIES[0]} />

              {/* trend graph — full width below */}
              <div className="mt-7 border-t border-white/[0.06] pt-5">
                <div className="mb-2 text-[11px] text-zinc-500">Monthly sales trend · top 6 brands</div>
                {manTrendData.length > 0 && (
                  <AreaChart data={manTrendData} animationDuration={1000} className="h-[320px] w-full">
                    <Grid horizontal />
                    {topBrands.map((b, i) => (
                      <Area key={b} dataKey={b} curve={curveNatural}
                        stroke={SERIES[i % SERIES.length]} fill={SERIES[i % SERIES.length]}
                        strokeWidth={2} fillOpacity={0.04} />
                    ))}
                    <XAxis />
                    <ChartTooltip />
                  </AreaChart>
                )}
                <Legend items={topBrands.map((b, i) => ({ c: SERIES[i % SERIES.length], l: b }))} />
              </div>
            </Panel>
          </Reveal>

          {/* provincial registrations */}
          <Reveal>
            <Panel title="Provincial registrations"
              note={`NaTIS · ${kind} · ${CLASS_LABEL[vclass]} · ${fmt(provTotal)} total over the window · tap a province`}
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented value={kind} onChange={setKind} options={[{ v: "new", l: "New" }, { v: "used", l: "Used" }]} />
                  <Select value={vclass} onChange={setVclass} options={Object.entries(CLASS_LABEL).map(([v, l]) => ({ v, l }))} />
                  <Select label="From" value={pfrom} onChange={setPfrom} options={natisMonthOpts} />
                  <Select label="To" value={pto} onChange={setPto} options={natisMonthOpts} />
                </div>}>
              <div className="grid gap-6 md:grid-cols-2">
                <ProvinceMap rows={prov} selected={sel} onSelect={setSel} />
                <div>
                  <RankBars data={prov.map((p) => ({ label: p.name, value: p.units }))} color={SERIES[5]} />
                  {sel && provTrendData.length > 0 && (
                    <div className="mt-5">
                      <div className="mb-1 text-[11px] text-zinc-500">{selName} · {kind} · monthly trend</div>
                      <AreaChart data={provTrendData} animationDuration={900} className="h-[170px] w-full">
                        <Grid horizontal />
                        <Area dataKey="Registrations" curve={curveNatural} stroke={SERIES[5]} fill={SERIES[5]} strokeWidth={2} fillOpacity={0.14} />
                        <XAxis />
                        <ChartTooltip />
                      </AreaChart>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </Reveal>
        </div>

        <footer className="mt-14 text-center text-[11px] text-zinc-600">
          Sources: naamsa (The Automotive Business Council), DMRE via oilprices.co.za, NaTIS. Python ingest · PostgreSQL · Node / TypeScript API · React.
        </footer>
      </main>
    </div>
  );
}

function Legend({ items }: { items: { c: string; l: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.l} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ background: it.c }} />{it.l}
        </span>
      ))}
    </div>
  );
}
