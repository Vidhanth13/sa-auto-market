"""
Fuel-price ingest (SA official DMRE figures, mirrored by oilprices.co.za).

The DMRE's own site blocks automated clients, so we read the monthly
"Every Month at a Glance" table from oilprices.co.za, which republishes the
official DMRE petrol/diesel/paraffin figures (inland / Gauteng).

Loads into fuel_price (zone='inland'), Jan 2024 -> latest. Idempotent.

Usage:  python ingest/fuel.py
"""
import os, re, sys, datetime
import requests
from bs4 import BeautifulSoup

import pdfkit
from naamsa import db_conn

URL = "https://oilprices.co.za/fuel-price-history"
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}


def parse_month(text):
    m = re.search(r"(january|february|march|april|may|june|july|august|"
                  r"september|october|november|december)\s+(\d{4})", text, re.I)
    if not m:
        return None
    return datetime.date(int(m.group(2)), MONTHS[m.group(1).lower()], 1)


def parse_rand(text):
    m = re.search(r"R?\s*(\d+\.\d{2})", text or "")
    return float(m.group(1)) if m else None


def scrape():
    r = requests.get(URL, headers={"User-Agent": pdfkit.BROWSER_UA}, timeout=60)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    rows = []
    for tr in soup.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        if len(cells) < 6:
            continue
        period = parse_month(cells[0])
        if not period:
            continue  # header / non-data row
        petrol95, petrol93, diesel50, diesel500, paraffin = (parse_rand(c) for c in cells[1:6])
        rows.append((period, "inland", petrol95, petrol93, diesel50, diesel500, paraffin))
    return rows


def main():
    rows = scrape()
    if not rows:
        print("no fuel rows parsed — page structure may have changed")
        sys.exit(1)
    conn = db_conn()
    try:
        n = pdfkit.upsert(
            conn, "fuel_price",
            ["period", "zone", "petrol95", "petrol93", "diesel50", "diesel500", "paraffin"],
            rows, conflict=["period", "zone"],
            update=["petrol95", "petrol93", "diesel50", "diesel500", "paraffin"])
        conn.commit()
        lo, hi = min(r[0] for r in rows), max(r[0] for r in rows)
        print(f"loaded {n} fuel rows: {lo:%Y-%m} -> {hi:%Y-%m}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
