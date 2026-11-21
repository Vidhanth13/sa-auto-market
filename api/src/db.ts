import pg from "pg";

// numeric (OID 1700) -> JS number so the API emits numbers, not strings
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({
  host: process.env.SAM_PGHOST,
  port: Number(process.env.SAM_PGPORT ?? 5432),
  database: process.env.SAM_PGDATABASE,
  user: process.env.SAM_PGUSER,
  password: process.env.SAM_PGPASSWORD,
});

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}
