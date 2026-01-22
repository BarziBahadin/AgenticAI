import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function getPool() {
  if (pool) return pool;

  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT ?? "3306");
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error("DB_ENV_MISSING: set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env");
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    dateStrings: false
  });

  return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const p = getPool();
  const [rows] = await p.query(sql, params);
  return rows as T[];
}
