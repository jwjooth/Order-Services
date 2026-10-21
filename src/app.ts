import { Elysia, t } from "elysia";
import { OrderService } from "./application/order.service.ts";
import type { OrderRepository } from "./domain/order.repository.ts";
import type { Db } from "./infrastructure/db/postgres.ts";
import { PostgresOrderRepository } from "./infrastructure/repositories/postgres-order.repository.ts";
import {
  handleError,
  healthRoutes,
  orderRoutes,
} from "./interfaces/http/order.routes.ts";
import type { Config } from "./shared/config.ts";
import type { Logger } from "./shared/logger.ts";

export interface AppDeps {
  config: Config;
  logger: Logger;
  db: Db;
  repository?: OrderRepository;
}

export function buildApp(deps: AppDeps) {
  const { config, logger, db } = deps;
  const repository = deps.repository ?? new PostgresOrderRepository(db);
  const service = new OrderService(repository);

  return new Elysia()
    .onError(({ error, set }) =>
      handleError(error, set as { status?: number | string }, logger),
    )
    .onAfterResponse(({ request, set, path }) => {
      logger.info("request", {
        method: request.method,
        path,
        status: set.status,
      });
    })
    .use(healthRoutes({ db, logger }))
    .use(orderRoutes({ service, db, logger }))
    .get("/", () => ({ service: "order-services", env: config.env }), {
      response: {
        200: t.Object({ service: t.String(), env: t.String() }),
      },
    });
}
