"""
naamsa flash-report ingest  (source-specific mapping; generic work in pdfkit.py)

Parses a monthly naamsa "Industry New Vehicle Sales" PDF into Postgres:
  - sales_manufacturer : per-brand Passenger/LCV + Commercial + Total, local & export
  - sales_segment      : Market-at-a-Glance segment totals (current month), local & export

Usage:
  python ingest/naamsa.py <period YYYY-MM> --url  <naamsa pdf url>
  python ingest/naamsa.py <period YYYY-MM> --file <local pdf path>
"""
import sys, os, datetime
import psycopg2

import pdfkit  # local reusable toolkit

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def db_conn():
    e = load_env()
    return psycopg2.connect(
        host=e["SAM_PGHOST"], port=e["SAM_PGPORT"], dbname=e["SAM_PGDATABASE"],
        user=e["SAM_PGUSER"], password=e["SAM_PGPASSWORD"],
    )


def clean_name(s):
    s = (s or "").strip()
    while s.endswith("*"):
        s = s[:-1].strip()
    return s


# ---- source-specific parsing: map naamsa tables -> our rows ----

def parse_manufacturers(tables):
    """(name, group, channel, units) from the per-brand tables.
    The manufacturer tables are identified by the merged 'Passenger LCV' header."""
    rows = []
    for t in pdfkit.find_tables(tables, must_contain="passenger lcv"):
        for r in t:
            if len(r) < 7:
                continue
            name_raw = (r[0] or "").strip()
            low = name_raw.lower()
            if not name_raw or low.startswith("* sales") or "passenger lcv" in low:
                continue
            vals = [pdfkit.parse_int(r[i]) for i in range(1, 7)]
            if all(v is None for v in vals):
                continue
            name = clean_name(name_raw)
            pl_l, pl_e, c_l, c_e, tot_l, tot_e = vals
            for grp, loc, exp in (("PassengerLCV", pl_l, pl_e),
                                  ("Commercial", c_l, c_e),
                                  ("Total", tot_l, tot_e)):
                rows.append((name, grp, "local", loc))
                rows.append((name, grp, "export", exp))
    return rows


SEGMENT_LABELS = {
    "passenger": "Passenger", "light cv": "LightCV", "medium cv": "MediumCV",
    "heavy cv": "HeavyCV", "extra heavy cv": "ExtraHeavyCV", "bus": "Bus",
}


def parse_segments(tables):
    """Market-at-a-Glance: current-month local & export per segment."""
    rows, seen = [], set()
    for t in tables:
        for r in t or []:
            label = (r[0] or "").strip().lower()
            seg = next((name for key, name in SEGMENT_LABELS.items() if label.startswith(key)), None)
            if not seg:
                continue
            nums = [n for n in (pdfkit.parse_int(c) for c in r[1:]) if n is not None]
            if len(nums) >= 2:
                for ch, u in (("local", nums[0]), ("export", nums[1])):
                    if (seg, ch) not in seen:
                        seen.add((seg, ch))
                        rows.append((seg, ch, u))
    return rows


def main():
    args = sys.argv[1:]
    if len(args) < 3 or args[1] not in ("--url", "--file"):
        print(__doc__)
        sys.exit(1)
    period = datetime.date(*map(int, args[0].split("-")), 1)
    mode, loc = args[1], args[2]

    dest = os.path.join(ROOT, "data", "raw", f"naamsa_{args[0]}.pdf")
    if mode == "--url":
        print(f"fetching naamsa report for {args[0]} ...")
        path = pdfkit.fetch_pdf(loc, dest)
        source_url = loc
    else:
        path, source_url = loc, None

    tables = pdfkit.read_tables(path)
    mans = parse_manufacturers(tables)
    segs = parse_segments(tables)
    print(f"parsed: {len(mans)} manufacturer rows, {len(segs)} segment rows for {period}")

    conn = db_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO naamsa_report(period, source_url) VALUES (%s,%s) "
            "ON CONFLICT (period) DO UPDATE SET source_url=EXCLUDED.source_url, fetched_at=now() "
            "RETURNING id", (period, source_url))
        report_id = cur.fetchone()[0]

        names = sorted({m[0] for m in mans})
        pdfkit.upsert(conn, "manufacturer", ["name"], [(n,) for n in names],
                      conflict=["name"], update=["name"])
        cur.execute("SELECT id, name FROM manufacturer")
        mid = {name: i for i, name in cur.fetchall()}

        pdfkit.upsert(conn, "sales_manufacturer",
                      ["report_id", "period", "manufacturer_id", "veh_group", "channel", "units"],
                      [(report_id, period, mid[n], g, ch, u) for (n, g, ch, u) in mans],
                      conflict=["period", "manufacturer_id", "veh_group", "channel"],
                      update=["units", "report_id"])
        pdfkit.upsert(conn, "sales_segment",
                      ["report_id", "period", "segment", "channel", "units"],
                      [(report_id, period, s, ch, u) for (s, ch, u) in segs],
                      conflict=["period", "segment", "channel"],
                      update=["units", "report_id"])
        conn.commit()
        print(f"loaded report_id={report_id}: {len(names)} manufacturers, {len(segs)} segment rows")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
