import { describe, expect, it } from "bun:test";
import { buildApp } from "../src/app.ts";
import type { Order, OrderStatus } from "../src/domain/order.ts";
import type {
  ListOrdersQuery,
  OrderRepository,
} from "../src/domain/order.repository.ts";
import type { Db } from "../src/infrastructure/db/postgres.ts";
import type { Config } from "../src/shared/config.ts";
import type { Logger } from "../src/shared/logger.ts";

class FakeOrderRepository implements OrderRepository {
  readonly rows = new Map<string, Order>();
  async create(order: Order): Promise<Order> {
    this.rows.set(order.id, order);
    return order;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async list(query: ListOrdersQuery) {
    return [...this.rows.values()]
      .filter((o) => !query.customerId || o.customerId === query.customerId)
      .filter((o) => !query.status || o.status === query.status)
      .slice(query.offset, query.offset + query.limit);
  }
  async changeStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    updatedAt: Date,
  ) {
    const order = this.rows.get(id);
    if (!order || order.status !== expectedStatus) return null;
    const updated = { ...order, status: nextStatus, updatedAt };
    this.rows.set(id, updated);
    return updated;
  }
}

// tagged-template stub so /ready can query without a real database
const fakeDb = (() => Promise.resolve([{ ok: 1 }])) as unknown as Db;

const config: Config = {
  env: "test",
  host: "0.0.0.0",
  port: 3000,
  databaseUrl: "postgres://fake/fake",
  databaseSsl: false,
  logLevel: "error",
};

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function makeApp() {
  return buildApp({
    config,
    logger,
    db: fakeDb,
    repository: new FakeOrderRepository(),
  });
}

describe("http api", () => {
  it("creates and reads an order", async () => {
    const app = makeApp();
    const created = await app.handle(
      new Request("http://localhost/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: "c-1",
          items: [{ sku: "SKU-1", quantity: 1, unitPriceCents: 500 }],
        }),
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; totalCents: number };
    expect(body.totalCents).toBe(500);

    const fetched = await app.handle(
      new Request(`http://localhost/orders/${body.id}`),
    );
    expect(fetched.status).toBe(200);
  });

  it("returns 404 for a missing order", async () => {
    const res = await makeApp().handle(
      new Request(
        "http://localhost/orders/11111111-1111-1111-1111-111111111111",
      ),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("rejects an invalid body with 422", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId: "", items: [] }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("serves health and readiness", async () => {
    const app = makeApp();
    expect(
      (await app.handle(new Request("http://localhost/health"))).status,
    ).toBe(200);
    expect(
      (await app.handle(new Request("http://localhost/ready"))).status,
    ).toBe(200);
  });
});
