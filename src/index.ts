import { buildApp } from "./app.ts";
import {
  createClient,
  createDrizzle,
  migrate,
} from "./infrastructure/db/postgres.ts";
import { loadConfig } from "./shared/config.ts";
import { createLogger } from "./shared/logger.ts";

const config = loadConfig();
const logger = createLogger(config);
const client = createClient(config);
const drizzleDb = createDrizzle(client);

// the database may still be booting (or DNS not ready) right after deploy
let migrated = false;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    await migrate(client, logger);
    migrated = true;
    break;
  } catch (err) {
    logger.error("migration failed", { attempt, message: String(err) });
    await Bun.sleep(attempt * 2000);
  }
}
if (!migrated) {
  await client.end({ timeout: 5 });
  process.exit(1);
}

const app = buildApp({ config, logger, client, drizzleDb });
app.listen({ hostname: config.host, port: config.port });

logger.info("server started", {
  host: config.host,
  port: config.port,
  env: config.env,
});

// drain connections on deploy/scale-down instead of dropping requests
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info("shutting down", { signal });
    await app.stop();
    await client.end({ timeout: 10 });
    process.exit(0);
  });
}
