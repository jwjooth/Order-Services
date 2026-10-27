import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Config } from "../../shared/config.ts";
import type { Logger } from "../../shared/logger.ts";
import * as schema from "./schema.ts";

export type Client = postgres.Sql;
export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export function createClient(config: Config): Client {
  return postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: config.databaseSsl ? "require" : false,
    onnotice: () => {},
  });
}

export function createDrizzle(client: Client): DrizzleDb {
  return drizzle(client, { schema });
}

export async function migrate(client: Client, logger: Logger): Promise<void> {
  await client`
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
  await client`
    CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)
  `;
  logger.info("database ready");
}
