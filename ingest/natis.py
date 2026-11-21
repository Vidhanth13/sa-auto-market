"""
NaTIS vehicle-registration ingest (provincial layer).

Source: natis.gov.za monthly PDFs - New / Used vehicle registrations, each a
province x vehicle-class matrix (9 provinces). The PDFs don't extract as clean
tables (spaced-thousands, embedded numbers in class labels), so we parse by
WORD X-POSITION: the header row fixes each province's column centre, and every
data row's numeric words are bucketed into the nearest column.

Each monthly file also contains the prior-year same month + a change table; we
parse every real data table (skipping change tables) and upsert - duplicates
collapse on the unique key, and we get a little extra history for free.

Usage:
  python ingest/natis.py discover            # build data/natis_manifest.csv
  python ingest/natis.py ingest              # download + parse + load everything
  python ingest/natis.py file <url> <new|used|population>
"""
import os, re, sys, csv, datetime, subprocess
import requests
import pdfplumber
import pdfkit
from naamsa import db_conn

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFEST = os.path.join(ROOT, "data", "natis_manifest.csv")
BASE = "https://www.natis.gov.za"
FILES = BASE + "/media/com_natisdownloads/files/"

PROV = {"GP": "GP", "KZ": "KZN", "KZN": "KZN", "WC": "WC", "EC": "EC",
        "FS": "FS", "MP": "MP", "NW": "NW", "L": "LP", "LP": "LP", "NC": "NC"}

CLASSES = [
    ("motor cars and station", "cars"),
    ("minibuses", "minibus"),
    ("buses, bus trains", "bus"),
    ("motorcycles", "motorcycle"),
    ("ldv", "ldv"),
    ("trucks (heavy", "truck"),
    ("other self-propelled", "other"),
    ("total self-propelled", "total_selfprop"),
]

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}


def classify(label):
    low = label.lower()
    for pref, name in CLASSES:
        if low.startswith(pref):
            return name
    return None


# ---------- parsing by word x-position ----------

def cluster_rows(words, ytol=3):
    rows, cur, last = [], [], None
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if last is None or abs(w["top"] - last) <= ytol:
            cur.append(w)
        else:
            rows.append(cur); cur = [w]
        last = w["top"]
    if cur:
        rows.append(cur)
    return rows


def parse_pdf(path, kind):
    """Yield (period, kind, province_code, veh_class, units)."""
    out = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            rows = cluster_rows(page.extract_words(x_tolerance=1.5))
            cols = None            # list[(code, xcenter)] incl ('TOTAL', x)
            value_left = None
            period = None
            skip = False
            for row in rows:
                texts = [w["text"] for w in row]
                joined = " ".join(texts)
                # title lines
                mdate = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", joined)
                if joined.strip().lower().startswith("change"):
                    skip = True; cols = None; continue
                if mdate and ("registration" in joined.lower() or "population" in joined.lower()):
                    mon = mdate.group(2).lower()
                    if mon in MONTHS:
                        period = datetime.date(int(mdate.group(3)), MONTHS[mon], 1)
                        skip = False
                    continue
                # header row with province codes
                if "GP" in texts and "NC" in texts and ("KZ" in texts or "KZN" in texts):
                    centers = [(w["text"], (w["x0"] + w["x1"]) / 2, w["x0"])
                               for w in row if w["text"] in PROV]
                    centers.sort(key=lambda c: c[1])
                    if any(c[0] == "GP" for c in centers):
                        xs = [c[1] for c in centers]
                        gaps = sorted(b - a for a, b in zip(xs, xs[1:]))
                        g = gaps[len(gaps) // 2] if gaps else 30
                        value_left = min(c[2] for c in centers) - 4
                        value_right = xs[-1] + 0.6 * g   # exclude the Total column past NC
                        cols = [(c[0], c[1]) for c in centers]
                    continue
                if skip or cols is None or period is None:
                    continue
                # data row?
                label = " ".join(w["text"] for w in row if w["x1"] < value_left)
                cls = classify(label)
                if not cls:
                    continue
                # bucket numeric value words into nearest column
                buckets = {c[0]: [] for c in cols}
                for w in sorted((w for w in row if w["x0"] >= value_left), key=lambda w: w["x0"]):
                    if not re.fullmatch(r"\d+", w["text"]):
                        continue
                    xc = (w["x0"] + w["x1"]) / 2
                    if xc > value_right:
                        continue   # Total / %-of-total columns
                    code = min(cols, key=lambda c: abs(c[1] - xc))[0]
                    buckets[code].append(w["text"])
                for code, toks in buckets.items():
                    if toks:
                        out.append((period, kind, PROV[code], cls, int("".join(toks))))
    return out


# ---------- discovery ----------

SECTIONS = {
    "new": "statistics/new-vehicle-registrations/new-vehicle-registrations-",
    # NaTIS's own URL misspells "vehicle" as "vehcile" in the used section
    "used": "statistics/used-vehcile-registrations/used-vehcile-registrations-",
}


def discover(years):
    rows = []
    for kind, path in SECTIONS.items():
        for yr in years:
            url = f"{BASE}/index.php/{path}{yr}"
            try:
                html = requests.get(url, headers={"User-Agent": pdfkit.BROWSER_UA}, timeout=60).text
            except requests.RequestException:
                continue
            for fn in sorted(set(re.findall(r"files/([A-Za-z0-9\-]+\.pdf)", html))):
                m = re.search(r"(\d{4})(\d{2})(\d{2})", fn)
                if not m:
                    continue
                period = f"{m.group(1)}-{m.group(2)}-01"
                rows.append((period, kind, FILES + fn))
            print(f"  {kind} {yr}: {sum(1 for r in rows if r[1]==kind and r[0][:4]==str(yr))} files")
    # dedupe
    seen, uniq = set(), []
    for p, k, u in rows:
        key = (p, k)
        if key not in seen:
            seen.add(key); uniq.append((p, k, u))
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([("period", "kind", "url"), *sorted(uniq)])
    print(f"\n{len(uniq)} files -> {MANIFEST}")


def ingest_one(url, kind):
    dest = os.path.join(ROOT, "data", "raw", "natis_" + url.split("/")[-1])
    pdfkit.fetch_pdf(url, dest, verbose=False)
    rows = parse_pdf(dest, kind)
    conn = db_conn()
    try:
        n = pdfkit.upsert(conn, "natis_registration",
                          ["period", "kind", "province_code", "veh_class", "units"],
                          rows, conflict=["period", "kind", "province_code", "veh_class"],
                          update=["units"])
        conn.commit()
    finally:
        conn.close()
    return len(rows)


def ingest_all():
    with open(MANIFEST, encoding="utf-8") as f:
        items = list(csv.DictReader(f))
    print(f"ingesting {len(items)} NaTIS files ...")
    for it in items:
        try:
            n = ingest_one(it["url"], it["kind"])
            print(f"  {it['period'][:7]} {it['kind']:4} rows={n}")
        except Exception as e:
            print(f"  {it['period'][:7]} {it['kind']:4} ERROR {e}")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "discover":
        yrs = [int(y) for y in sys.argv[2:]] or list(range(2023, 2027))
        discover(yrs)
    elif len(sys.argv) >= 2 and sys.argv[1] == "ingest":
        ingest_all()
    elif len(sys.argv) >= 4 and sys.argv[1] == "file":
        print("rows:", ingest_one(sys.argv[2], sys.argv[3]))
    else:
        print(__doc__)
