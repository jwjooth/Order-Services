import { Elysia, t } from "elysia";
import { OrderService } from "./application/order.service.ts";
import type { OrderRepository } from "./domain/order.repository.ts";
import {
  type Client,
  type DrizzleDb,
  createDrizzle,
} from "./infrastructure/db/postgres.ts";
import { DrizzleOrderRepository } from "./infrastructure/repositories/drizzle-order.repository.ts";
import { OrderController } from "./interfaces/http/order.controller.ts";
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
  client: Client;
  drizzleDb?: DrizzleDb;
  repository?: OrderRepository;
}

export function buildApp(deps: AppDeps) {
  const { config, logger, client } = deps;
  const repository =
    deps.repository ??
    new DrizzleOrderRepository(deps.drizzleDb ?? createDrizzle(client));
  const service = new OrderService(repository);
  const controller = new OrderController(service);

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
    .use(healthRoutes({ client, logger }))
    .use(orderRoutes({ controller }))
    .get("/", () => ({ service: "order-services", env: config.env }), {
      response: {
        200: t.Object({ service: t.String(), env: t.String() }),
      },
    });
}
