const BASE = ""; // vite proxies /api -> :4100

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export type Meta = {
  salesMonths: string[];
  natisMonths: string[];
  manufacturers: string[];
  provinces: { code: string; name: string }[];
  natisRange: { kind: string; f: string; t: string }[];
  vehClasses: string[];
};
export type SalesVsFuel = {
  series: { period: string; passenger: number; petrol95: number }[];
  correlation: number;
  months: number;
};
export type ManRow = { name: string; units: number; months?: number };
export type ManTrendRow = { period: string; name: string; units: number };
export type ProvRow = { code: string; name: string; units: number; pct: number };
export type TrendRow = { period: string; units: number };
export type FuelRow = { period: string; petrol95: number };
