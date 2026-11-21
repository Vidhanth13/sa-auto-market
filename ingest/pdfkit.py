"""
pdfkit - a small, reusable toolkit for ingesting tabular data out of PDFs.

This is the GENERIC layer. It knows nothing about any specific report. A
source-specific ingest (e.g. naamsa.py) imports these helpers and supplies
only the mapping: which table, and how its columns map to your schema.

The repeatable recipe for a new PDF source:
    1. fetch_pdf(url, dest)            -> get the bytes, verified as a real PDF
    2. tables = read_tables(dest)      -> list of tables, each a list[list[str]]
    3. pick the table you want         -> find_table(tables, must_contain=...)
    4. for each data row: parse_int()  -> turn "13 750" / "-" into int | None
    5. upsert(conn, ...)               -> idempotent load into Postgres

Design notes:
    - Government / industry PDFs often block naive clients: we send a browser
      User-Agent and verify the %PDF magic so an HTML error page can't sneak
      through as if it were data.
    - Numbers in SA/EU reports use spaces as thousand separators and "-" / "-"
      for null; parse_int handles both, plus NBSP and negatives.
"""
from __future__ import annotations
import os
import requests
import pdfplumber
from psycopg2.extras import execute_values

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " \
             "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"


class NotAPdf(Exception):
    """Raised when a fetched URL did not return real PDF bytes (e.g. blocked / HTML)."""


def fetch_pdf(url: str, dest: str, mirrors: list[str] | None = None,
              timeout: int = 120, verbose: bool = True) -> str:
    """Download `url` (trying `mirrors` on failure) to `dest`, verified as a PDF.

    Returns the path written. Raises NotAPdf if no source yielded PDF bytes.
    """
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    errors = []
    for src in [url, *(mirrors or [])]:
        try:
            r = requests.get(src, headers={"User-Agent": BROWSER_UA},
                             timeout=timeout, allow_redirects=True)
            ctype = r.headers.get("Content-Type", "")
            ok = r.status_code == 200 and r.content[:5] == b"%PDF-"
            if verbose:
                host = src.split("/")[2] if "//" in src else src
                print(f"  fetch {host}: HTTP {r.status_code}, {len(r.content):,} bytes, "
                      f"{ctype or 'no content-type'} -> {'PDF OK' if ok else 'NOT a PDF'}")
            if ok:
                with open(dest, "wb") as f:
                    f.write(r.content)
                return dest
            errors.append(f"{src}: status={r.status_code} ctype={ctype} magic={r.content[:5]!r}")
        except requests.RequestException as e:
            errors.append(f"{src}: {e}")
            if verbose:
                print(f"  fetch {src}: ERROR {e}")
    raise NotAPdf("No source returned PDF bytes:\n  " + "\n  ".join(errors))


def read_tables(path: str, pages: list[int] | None = None) -> list[list[list[str]]]:
    """Return every table on the given pages (0-indexed; all pages if None)."""
    out = []
    with pdfplumber.open(path) as pdf:
        targets = pdf.pages if pages is None else [pdf.pages[i] for i in pages]
        for pg in targets:
            out.extend(pg.extract_tables())
    return out


def find_tables(tables, must_contain: str, scan_rows: int = 3):
    """Yield tables whose first `scan_rows` rows (joined) contain `must_contain`."""
    needle = must_contain.lower()
    for t in tables:
        if not t:
            continue
        blob = " ".join(str(c or "") for row in t[:scan_rows] for c in row).lower()
        if needle in blob:
            yield t


def parse_int(cell):
    """Turn a report cell into int or None. Handles '13 750', NBSP, '-', '-', negatives."""
    if cell is None:
        return None
    s = str(cell).strip().replace("\xa0", "").replace(" ", "")
    if s in ("", "-", "-", "*"):
        return None
    neg = s.startswith("-")
    s = s.lstrip("-")
    if not s.isdigit():
        return None
    v = int(s)
    return -v if neg else v


def upsert(conn, table: str, columns: list[str], rows: list[tuple],
           conflict: list[str], update: list[str]):
    """Idempotent bulk insert. ON CONFLICT(conflict) updates `update` columns."""
    if not rows:
        return 0
    set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in update)
    sql = (f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s "
           f"ON CONFLICT ({', '.join(conflict)}) DO UPDATE SET {set_clause}")
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    return len(rows)
