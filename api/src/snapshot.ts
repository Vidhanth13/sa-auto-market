// Bakes the whole dataset into a static JSON bundle the frontend reads directly,
// so the deployed site needs no API or database. Run: node --env-file=../.env src/snapshot.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { q, pool } from "./db.ts";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "..", "..", "frontend", "public", "data");

async function main() {
  const [salesMonths, natisMonths, provinces, manufacturers, svfSeries, svfCorr, natis] =
    await Promise.all([
      q("SELECT to_char(period,'YYYY-MM') m FROM naamsa_report ORDER BY period"),
      q("SELECT DISTINCT to_char(period,'YYYY-MM') m FROM natis_registration ORDER BY m"),
      q("SELECT code, name FROM province ORDER BY name"),
      q(`SELECT to_char(s.period,'YYYY-MM') period, m.name, s.units
           FROM sales_manufacturer s JOIN manufacturer m ON m.id=s.manufacturer_id
          WHERE s.veh_group='Total' AND s.channel='local' AND s.units IS NOT NULL
          ORDER BY s.period, m.name`),
      q(`SELECT to_char(s.period,'YYYY-MM') period, s.units AS passenger, f.petrol95
           FROM sales_segment s JOIN fuel_price f ON f.period=s.period AND f.zone='inland'
          WHERE s.segment='Passenger' AND s.channel='local' ORDER BY s.period`),
      q<{ r: number; n: number }>(
        `SELECT round(corr(s.units, f.petrol95)::numeric,3) r, count(*)::int n
           FROM sales_segment s JOIN fuel_price f ON f.period=s.period AND f.zone='inland'
          WHERE s.segment='Passenger' AND s.channel='local'`),
      q(`SELECT to_char(period,'YYYY-MM') period, kind, veh_class AS class, province_code AS code, units
           FROM natis_registration WHERE kind IN ('new','used') AND units IS NOT NULL
          ORDER BY period`),
    ]);

  const dataset = {
    generatedAt: new Date().toISOString(),
    meta: {
      salesMonths: salesMonths.map((r: any) => r.m),
      natisMonths: natisMonths.map((r: any) => r.m),
      provinces,
      vehClasses: ["cars", "ldv", "truck", "minibus", "bus", "motorcycle", "other", "total_selfprop"],
    },
    salesVsFuel: {
      series: svfSeries.map((r: any) => ({ period: r.period, passenger: Number(r.passenger), petrol95: Number(r.petrol95) })),
      correlation: Number(svfCorr[0].r),
      months: svfCorr[0].n,
    },
    manufacturers: manufacturers.map((r: any) => ({ period: r.period, name: r.name, units: Number(r.units) })),
    natis: natis.map((r: any) => ({ period: r.period, kind: r.kind, class: r.class, code: r.code, units: Number(r.units) })),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, "dataset.json");
  writeFileSync(out, JSON.stringify(dataset));
  console.log(`wrote ${out}`);
  console.log(`  ${dataset.manufacturers.length} manufacturer rows, ${dataset.natis.length} natis rows, ${dataset.salesVsFuel.series.length} svf months`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
