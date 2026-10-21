import {
  Elysia,
  NotFoundError as ElysiaNotFoundError,
  t,
  ValidationError as ElysiaValidationError,
} from "elysia";
import type { OrderService } from "../../application/order.service.ts";
import type { Db } from "../../infrastructure/db/postgres.ts";
import { AppError } from "../../shared/errors.ts";
import type { Logger } from "../../shared/logger.ts";

const OrderItem = t.Object({
  sku: t.String({ minLength: 1 }),
  quantity: t.Integer({ minimum: 1 }),
  unitPriceCents: t.Integer({ minimum: 0 }),
});

const CreateOrderBody = t.Object({
  customerId: t.String({ minLength: 1 }),
  items: t.Array(OrderItem, { minItems: 1 }),
});

const OrderSchema = t.Object({
  id: t.String(),
  customerId: t.String(),
  items: t.Array(OrderItem),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("shipped"),
    t.Literal("cancelled"),
  ]),
  totalCents: t.Integer(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

const OrderList = t.Array(OrderSchema);

const ListQuery = t.Object({
  customerId: t.Optional(t.String()),
  status: t.Optional(
    t.Union([
      t.Literal("pending"),
      t.Literal("confirmed"),
      t.Literal("shipped"),
      t.Literal("cancelled"),
    ]),
  ),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
  offset: t.Optional(t.Integer({ minimum: 0 })),
});

const StatusBody = t.Object({
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("shipped"),
    t.Literal("cancelled"),
  ]),
});

export function orderRoutes(deps: {
  service: OrderService;
  db: Db;
  logger: Logger;
}) {
  const { service, db, logger } = deps;

  return new Elysia({ prefix: "/orders" })
    .post(
      "/",
      async ({ body, status }) => {
        const order = await service.create(body);
        return status(201, order);
      },
      { body: CreateOrderBody, response: { 201: OrderSchema } },
    )
    .get(
      "/:id",
      async ({ params, status }) => {
        const order = await service.getById(params.id);
        return status(200, order);
      },
      { params: t.Object({ id: t.String({ format: "uuid" }) }), response: { 200: OrderSchema } },
    )
    .get(
      "/",
      async ({ query, status }) => {
        const orders = await service.list(query);
        return status(200, orders);
      },
      { query: ListQuery, response: { 200: OrderList } },
    )
    .patch(
      "/:id/status",
      async ({ params, body, status }) => {
        const order = await service.changeStatus(params.id, body.status);
        return status(200, order);
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: StatusBody,
        response: { 200: OrderSchema },
      },
    );
}

export function healthRoutes(deps: { db: Db; logger: Logger }) {
  const { db } = deps;
  return new Elysia()
    .get("/health", () => ({ status: "ok" }), {
      response: { 200: t.Object({ status: t.String() }) },
    })
    .get(
      "/ready",
      async ({ status }) => {
        try {
          await db`SELECT 1`;
          return status(200, { status: "ready" });
        } catch (err) {
          return status(503, { status: "not_ready", error: String(err) });
        }
      },
      {
        response: {
          200: t.Object({ status: t.String() }),
          503: t.Object({
            status: t.String(),
            error: t.String(),
          }),
        },
      },
    );
}

export function handleError(
  error: unknown,
  set: { status?: number | string },
  logger: Logger,
) {
  if (error instanceof AppError) {
    logger.warn("request failed", { code: error.code, message: error.message });
    set.status = error.status;
    return {
      error: { code: error.code, message: error.message, details: error.details },
    };
  }
  if (error instanceof ElysiaValidationError) {
    // a response-schema violation is our bug, not the caller's -> 500
    if (error.type === "response") {
      logger.error("response schema violated", { message: error.message });
      set.status = 500;
      return {
        error: { code: "INTERNAL_ERROR", message: "internal server error" },
      };
    }
    logger.warn("schema validation failed", { message: error.message });
    set.status = 422;
    return {
      error: { code: "VALIDATION_ERROR", message: "request validation failed" },
    };
  }
  if (error instanceof ElysiaNotFoundError) {
    set.status = 404;
    return { error: { code: "NOT_FOUND", message: "route not found" } };
  }
  logger.error("unhandled error", { message: String(error) });
  set.status = 500;
  return { error: { code: "INTERNAL_ERROR", message: "internal server error" } };
}
