"""
naamsa backfill - discover historical flash-report PDFs and ingest them.

naamsa's filenames are inconsistent, so we don't guess blindly: for each month
we probe a small set of known naming conventions against the expected upload
folder (the data month is published the following month) and accept the first
URL that returns real PDF bytes. Found URLs are written to data/manifest.csv.

Usage:
  python ingest/naamsa_backfill.py discover <from YYYY-MM> <to YYYY-MM>
  python ingest/naamsa_backfill.py ingest            # ingest everything in manifest
"""
import sys, os, csv, re, datetime, subprocess
import requests
import pdfkit

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFEST = os.path.join(ROOT, "data", "manifest.csv")
MEDIA_API = "https://naamsa.net/wp-json/wp/v2/media"


def period_from_filename(fn):
    """Derive the DATA month from a naamsa flash filename.
    - FLASH_STD_YYYYMM...  -> that year-month (the data month directly)
    - YYYYMMDD-...         -> leading publish date; data month = publish month - 1
    """
    m = re.search(r"FLASH_STD[_-]?(\d{4})(\d{2})", fn, re.I)
    if m:
        return datetime.date(int(m.group(1)), int(m.group(2)), 1)
    m = re.match(r"(\d{4})(\d{2})(\d{2})", fn)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        return datetime.date(y - 1, 12, 1) if mo == 1 else datetime.date(y, mo - 1, 1)
    return None


def _rank(fn):
    """Prefer corrected/updated revisions, then plain, then '-1' duplicates."""
    low = fn.lower()
    if "corrected" in low or "updated" in low:
        return 3
    if re.search(r"-\d+\.pdf$", low):
        return 1
    return 2


def media_pdfs():
    """All flash-report PDFs via the WordPress media API (search 'flash')."""
    items = []
    for term in ("flash", "FLASH_STD"):
        for pg in range(1, 4):
            r = requests.get(MEDIA_API, params={"search": term, "per_page": 100,
                             "page": pg, "_fields": "source_url,title"},
                             headers={"User-Agent": pdfkit.BROWSER_UA}, timeout=60)
            if r.status_code != 200:
                break
            batch = r.json()
            if not batch:
                break
            items += batch
    seen, out = set(), []
    for it in items:
        u = it.get("source_url", "")
        if u.lower().endswith(".pdf") and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def discover(a=None, b=None):
    lo = datetime.date(*map(int, a.split("-")), 1) if a else datetime.date(2000, 1, 1)
    hi = datetime.date(*map(int, b.split("-")), 1) if b else datetime.date(2100, 1, 1)
    best = {}  # period -> (rank, url)
    for u in media_pdfs():
        fn = u.split("/")[-1]
        p = period_from_filename(fn)
        if not p or not (lo <= p <= hi):
            continue
        r = _rank(fn)
        if p not in best or r > best[p][0]:
            best[p] = (r, u)

    rows = sorted((p.isoformat(), url) for p, (_, url) in best.items())
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([("period", "url"), *rows])

    periods = sorted(best)
    for p in periods:
        print(f"  {p:%Y-%m}  OK   {best[p][1].split('/')[-1]}")
    # report gaps within the covered span
    if periods:
        span, cur = [], periods[0]
        while cur <= periods[-1]:
            span.append(cur)
            cur = datetime.date(cur.year + (cur.month == 12), (cur.month % 12) + 1, 1)
        gaps = [f"{d:%Y-%m}" for d in span if d not in best]
        print(f"\nfound {len(periods)} reports: {periods[0]:%Y-%m} -> {periods[-1]:%Y-%m}")
        print(f"gaps in span: {', '.join(gaps) or 'none'}")
    print(f"manifest -> {MANIFEST}")


def ingest():
    with open(MANIFEST, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"ingesting {len(rows)} reports from manifest ...")
    for row in rows:
        period = row["period"][:7]   # YYYY-MM
        print(f"--- {period}")
        subprocess.run([sys.executable, os.path.join(HERE, "naamsa.py"),
                        period, "--url", row["url"]], check=False)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "discover":
        discover(*(sys.argv[2:4] if len(sys.argv) >= 4 else ()))
    elif len(sys.argv) >= 2 and sys.argv[1] == "ingest":
        ingest()
    else:
        print(__doc__)
