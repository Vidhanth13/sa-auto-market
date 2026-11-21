// Loads the baked dataset and computes every view client-side,
// so the deployed site needs no API or database.
import type { ManRow, ManTrendRow, ProvRow, TrendRow } from "./api.ts";

export type ManSrc = { period: string; name: string; units: number };
export type NatisSrc = { period: string; kind: string; class: string; code: string; units: number };

export type Dataset = {
  generatedAt: string;
  meta: {
    salesMonths: string[];
    natisMonths: string[];
    provinces: { code: string; name: string }[];
    vehClasses: string[];
  };
  salesVsFuel: {
    series: { period: string; passenger: number; petrol95: number }[];
    correlation: number;
    months: number;
  };
  manufacturers: ManSrc[];
  natis: NatisSrc[];
};

let cache: Dataset | null = null;
export async function loadDataset(): Promise<Dataset> {
  if (cache) return cache;
  const r = await fetch(`${import.meta.env.BASE_URL}data/dataset.json`);
  if (!r.ok) throw new Error(`dataset.json: ${r.status}`);
  cache = (await r.json()) as Dataset;
  return cache;
}

const inRange = (p: string, from: string, to: string) => p >= from && p <= to;

// manufacturers ranked by units added over [from,to]
export function rankManufacturers(ds: Dataset, from: string, to: string, limit: number): ManRow[] {
  const totals = new Map<string, { units: number; months: Set<string> }>();
  for (const r of ds.manufacturers) {
    if (!inRange(r.period, from, to)) continue;
    const t = totals.get(r.name) ?? { units: 0, months: new Set() };
    t.units += r.units;
    t.months.add(r.period);
    totals.set(r.name, t);
  }
  return [...totals.entries()]
    .map(([name, t]) => ({ name, units: t.units, months: t.months.size }))
    .sort((a, b) => b.units - a.units)
    .slice(0, limit);
}

// monthly trend rows for the named brands, clamped to [from,to]
export function manufacturerTrend(ds: Dataset, names: string[], from: string, to: string): ManTrendRow[] {
  const set = new Set(names);
  return ds.manufacturers
    .filter((r) => set.has(r.name) && inRange(r.period, from, to))
    .map((r) => ({ period: r.period, name: r.name, units: r.units }));
}

// provinces ranked by units summed over [from,to] for a kind + class
export function rankProvinces(ds: Dataset, kind: string, cls: string, from: string, to: string, provinces: { code: string; name: string }[]): ProvRow[] {
  const nameOf = new Map(provinces.map((p) => [p.code, p.name]));
  const totals = new Map<string, number>();
  for (const r of ds.natis) {
    if (r.kind !== kind || r.class !== cls || !inRange(r.period, from, to)) continue;
    totals.set(r.code, (totals.get(r.code) ?? 0) + r.units);
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  return [...totals.entries()]
    .map(([code, units]) => ({ code, name: nameOf.get(code) ?? code, units, pct: Math.round((1000 * units) / grand) / 10 }))
    .sort((a, b) => b.units - a.units);
}

// full monthly trend for one province (kind + class), all history
export function provinceTrend(ds: Dataset, code: string, kind: string, cls: string): TrendRow[] {
  return ds.natis
    .filter((r) => r.code === code && r.kind === kind && r.class === cls)
    .map((r) => ({ period: r.period, units: r.units }))
    .sort((a, b) => a.period.localeCompare(b.period));
}
