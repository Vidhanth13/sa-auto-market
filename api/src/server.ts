import express, { type Request, type Response } from "express";
import cors from "cors";
import { q, pool } from "./db.ts";

const app = express();
app.use(cors());
app.use(express.json());

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((e) => {
      console.error(e);
      res.status(500).json({ error: String(e?.message ?? e) });
    });

// ---- health ----
app.get("/health", wrap(async (_req, res) => {
  const [{ now }] = await q<{ now: string }>("SELECT now()");
  res.json({ ok: true, now });
}));

// ---- meta: dropdown fodder ----
app.get("/api/meta", wrap(async (_req, res) => {
  const [months, manufacturers, provinces, natis] = await Promise.all([
    q("SELECT to_char(period,'YYYY-MM') m FROM naamsa_report ORDER BY period"),
    q(`SELECT m.name, SUM(s.units) total
         FROM sales_manufacturer s JOIN manufacturer m ON m.id=s.manufacturer_id
        WHERE s.veh_group='Total' AND s.channel='local'
        GROUP BY m.name ORDER BY total DESC NULLS LAST`),
    q("SELECT code, name FROM province ORDER BY name"),
    q(`SELECT kind, to_char(min(period),'YYYY-MM') f, to_char(max(period),'YYYY-MM') t
         FROM natis_registration GROUP BY kind`),
  ]);
  res.json({
    salesMonths: months.map((r: any) => r.m),
    manufacturers: manufacturers.map((r: any) => r.name),
    provinces,
    natisRange: natis,
    vehClasses: ["cars", "ldv", "truck", "minibus", "bus", "motorcycle", "other", "total_selfprop"],
  });
}));

// ---- national segment trend ----
app.get("/api/segments", wrap(async (req, res) => {
  const channel = (req.query.channel as string) ?? "local";
  const rows = await q(
    `SELECT to_char(period,'YYYY-MM') period, segment, units
       FROM sales_segment WHERE channel=$1 ORDER BY period, segment`, [channel]);
  res.json(rows);
}));

// ---- manufacturers: ranking for a month, or trend for named brands ----
app.get("/api/manufacturers", wrap(async (req, res) => {
  const group = (req.query.group as string) ?? "Total";
  if (req.query.names) {
    const names = (req.query.names as string).split(",").map((s) => s.trim());
    const rows = await q(
      `SELECT to_char(s.period,'YYYY-MM') period, m.name, s.units
         FROM sales_manufacturer s JOIN manufacturer m ON m.id=s.manufacturer_id
        WHERE s.veh_group=$1 AND s.channel='local' AND m.name = ANY($2)
        ORDER BY s.period`, [group, names]);
    res.json(rows);
    return;
  }
  const month = (req.query.month as string) ?? null;
  const limit = Number(req.query.limit ?? 15);
  const rows = await q(
    `SELECT m.name, s.units
       FROM sales_manufacturer s JOIN manufacturer m ON m.id=s.manufacturer_id
      WHERE s.veh_group=$1 AND s.channel='local'
        AND s.period = COALESCE($2::date, (SELECT max(period) FROM sales_manufacturer))
      ORDER BY s.units DESC NULLS LAST LIMIT $3`,
    [group, month ? `${month}-01` : null, limit]);
  res.json(rows);
}));

// ---- fuel series ----
app.get("/api/fuel", wrap(async (_req, res) => {
  const rows = await q(
    `SELECT to_char(period,'YYYY-MM') period, petrol95, petrol93, diesel50, diesel500, paraffin
       FROM fuel_price WHERE zone='inland' ORDER BY period`);
  res.json(rows);
}));

// ---- the headline: sales vs fuel, joined + correlation ----
app.get("/api/sales-vs-fuel", wrap(async (_req, res) => {
  const series = await q(
    `SELECT to_char(s.period,'YYYY-MM') period, s.units AS passenger, f.petrol95
       FROM sales_segment s JOIN fuel_price f ON f.period=s.period AND f.zone='inland'
      WHERE s.segment='Passenger' AND s.channel='local' ORDER BY s.period`);
  const [{ r, n }] = await q<{ r: number; n: number }>(
    `SELECT round(corr(s.units, f.petrol95)::numeric,3) r, count(*)::int n
       FROM sales_segment s JOIN fuel_price f ON f.period=s.period AND f.zone='inland'
      WHERE s.segment='Passenger' AND s.channel='local'`);
  res.json({ series, correlation: r, months: n });
}));

// ---- provincial map: one month, one class ----
app.get("/api/provinces", wrap(async (req, res) => {
  const kind = (req.query.kind as string) ?? "new";
  const cls = (req.query.class as string) ?? "cars";
  const month = (req.query.month as string) ?? null;
  const rows = await q(
    `SELECT r.province_code code, p.name, r.units,
            round(100.0*r.units/NULLIF(SUM(r.units) OVER (),0),1) pct
       FROM natis_registration r JOIN province p ON p.code=r.province_code
      WHERE r.kind=$1 AND r.veh_class=$2
        AND r.period = COALESCE($3::date,
            (SELECT max(period) FROM natis_registration WHERE kind=$1))
      ORDER BY r.units DESC`,
    [kind, cls, month ? `${month}-01` : null]);
  res.json(rows);
}));

// ---- provincial trend for one province ----
app.get("/api/provinces/trend", wrap(async (req, res) => {
  const code = (req.query.code as string) ?? "GP";
  const kind = (req.query.kind as string) ?? "new";
  const cls = (req.query.class as string) ?? "cars";
  const rows = await q(
    `SELECT to_char(period,'YYYY-MM') period, units
       FROM natis_registration
      WHERE province_code=$1 AND kind=$2 AND veh_class=$3
      ORDER BY period`, [code, kind, cls]);
  res.json(rows);
}));

const PORT = Number(process.env.PORT ?? 4100);
const server = app.listen(PORT, () => console.log(`SA Auto Market API on :${PORT}`));

process.on("SIGTERM", () => server.close(() => pool.end()));
