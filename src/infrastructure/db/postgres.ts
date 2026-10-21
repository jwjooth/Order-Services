import postgres from "postgres";
import type { Config } from "../../shared/config.ts";
import type { Logger } from "../../shared/logger.ts";

export type Db = postgres.Sql;

export function createDb(config: Config, logger: Logger): Db {
  const sql = postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: config.databaseSsl ? "require" : false,
    onnotice: () => {},
  });
  return sql;
}

export async function migrate(db: Db, logger: Logger): Promise<void> {
  await db`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      total_cents BIGINT NOT NULL,
      items JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)
  `;
  logger.info("database ready");
}
