"""Quick console view of what's in sa_auto_market."""
import os, psycopg2
from naamsa import db_conn  # reuse .env loader + connection

def main():
    conn = db_conn(); cur = conn.cursor()
    cur.execute("SELECT period, count(*) FROM naamsa_report GROUP BY period ORDER BY period")
    reports = cur.fetchall()
    print("\n=== naamsa reports loaded ===")
    for p, _ in reports:
        print("  -", p)

    cur.execute("""
        SELECT to_char(period,'Mon YYYY') AS m, segment, units
        FROM sales_segment WHERE channel='local'
        ORDER BY period, units DESC""")
    print("\n=== National new-vehicle sales by segment (local units) ===")
    for m, seg, u in cur.fetchall():
        print(f"  {m}  {seg:<13} {u:>7,}")

    cur.execute("""
        SELECT m.name, s.units
        FROM sales_manufacturer s JOIN manufacturer m ON m.id=s.manufacturer_id
        WHERE s.veh_group='Total' AND s.channel='local'
          AND s.period=(SELECT max(period) FROM sales_manufacturer)
        ORDER BY s.units DESC NULLS LAST LIMIT 15""")
    print("\n=== Top 15 manufacturers - total local sales (latest month) ===")
    for i, (name, u) in enumerate(cur.fetchall(), 1):
        print(f"  {i:>2}. {name:<34} {u:>7,}" if u is not None else f"  {i:>2}. {name:<34}       -")
    conn.close()

if __name__ == "__main__":
    main()
