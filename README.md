# SA Auto Market Intelligence

A full-stack data application on the **South African new-vehicle market** - built
end-to-end from government and industry source documents, not a tidy API.

> **Python ingest → PostgreSQL → Node/TypeScript API → React dashboard.**

![dashboard](docs/dashboard.png)

## What it does

- **National sales vs fuel** - monthly new-vehicle sales (naamsa) indexed against
  petrol price (DMRE), showing the two barely correlate (Pearson r ≈ 0.20): SA's
  sales growth is structural, not fuel-driven.
- **Top manufacturers** - pick a date range and see which brands added the most
  units over that window, plus a monthly trend line per brand (watch the Chinese
  entrants climb), 2023 → present.
- **Provincial map** - an interactive choropleth of all 9 provinces with a
  New/Used toggle (NaTIS registrations by vehicle class) and per-province trends.

## Data sources (all SA, all from source files)

| Source | What | Format | Coverage |
|---|---|---|---|
| **naamsa** (Automotive Business Council) | new-vehicle sales by manufacturer & segment | monthly PDF flash reports | 2023-01 → present |
| **DMRE** (via oilprices.co.za mirror) | petrol / diesel / paraffin prices | monthly HTML table | 2024-01 → present |
| **NaTIS** | vehicle registrations (new & used) by province & class | monthly PDF | 2022 → present |

None of these publish a clean API, so the interesting work is the ingest: the
figures are liberated from PDFs and HTML into a queryable Postgres schema.

## Architecture

```
ingest/            Python - PDF/HTML → PostgreSQL
  pdfkit.py          reusable toolkit: fetch (PDF-verified) + table extract + number parse + upsert
  naamsa.py          naamsa flash-report mapping
  naamsa_backfill.py discovers reports via the WordPress media API, backfills the series
  fuel.py            fuel-price scrape
  natis.py           province × class parse by word x-position (handles spaced-thousands)
db/schema.sql      normalised schema (sales, fuel, registrations, reference tables)
api/               Node + TypeScript + Express + pg  (runs natively on Node ≥ 23, no build step)
frontend/          React + Vite + Tailwind v4; visx animated charts; Geist type; d3-geo-built province map
```

## Engineering notes

- **`pdfkit`** is a small reusable layer (fetch + verify + table-extract + number
  tokenizer + idempotent upsert); each source is a thin mapping on top - so a new
  PDF source is a new mapping file, not a rewrite.
- **NaTIS PDFs don't extract as clean tables** (spaced thousands, numbers embedded
  in class labels), so rows are parsed by **word x-position**, bucketing each digit
  into its province column. Validated by checksum (9 provinces == the PDF's Total).
- **Charts follow one rule strictly: no dual-axis.** Sales and fuel are *indexed to
  100* on a single axis - the correct way to compare two different scales.
- **The province map** is built at compile time: a GeoJSON → d3-geo projection →
  bundled SVG paths (no runtime map library). Ring winding is corrected for
  d3-geo's spherical convention.

## Run it

```bash
# 1. database
createdb sa_auto_market && psql sa_auto_market -f db/schema.sql
cp .env.example .env    # fill in Postgres creds

# 2. ingest
pip install pdfplumber psycopg2 requests beautifulsoup4
python ingest/naamsa_backfill.py discover && python ingest/naamsa_backfill.py ingest
python ingest/fuel.py
python ingest/natis.py discover && python ingest/natis.py ingest

# 3. api  (Node ≥ 23)
cd api && npm install && npm start            # :4100

# 4. dashboard
cd frontend && npm install && npm run buildmap && npm run dev   # :5273
```

## Licence

MIT. Data © their respective sources (naamsa, DMRE, NaTIS) - used for analysis with
attribution; not redistributed.
