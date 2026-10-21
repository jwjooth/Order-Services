import { describe, expect, it } from "bun:test";
import { OrderService } from "../src/application/order.service.ts";
import type { Order, OrderStatus } from "../src/domain/order.ts";
import type {
  ListOrdersQuery,
  OrderRepository,
} from "../src/domain/order.repository.ts";

class FakeOrderRepository implements OrderRepository {
  readonly rows = new Map<string, Order>();
  readonly listCalls: ListOrdersQuery[] = [];

  async create(order: Order): Promise<Order> {
    this.rows.set(order.id, order);
    return order;
  }
  async findById(id: string): Promise<Order | null> {
    return this.rows.get(id) ?? null;
  }
  async list(query: ListOrdersQuery): Promise<Order[]> {
    this.listCalls.push(query);
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
  ): Promise<Order | null> {
    const order = this.rows.get(id);
    if (!order || order.status !== expectedStatus) return null;
    const updated = { ...order, status: nextStatus, updatedAt };
    this.rows.set(id, updated);
    return updated;
  }
}

function service() {
  return new OrderService(new FakeOrderRepository());
}

const item = { sku: "SKU-1", quantity: 2, unitPriceCents: 1500 };

describe("OrderService", () => {
  it("creates a pending order with a computed total", async () => {
    const order = await service().create({ customerId: "c-1", items: [item] });
    expect(order.status).toBe("pending");
    expect(order.totalCents).toBe(3000);
    expect(order.id).toBeString();
  });

  it("rejects an order with no items", async () => {
    expect(
      service().create({ customerId: "c-1", items: [] }),
    ).rejects.toThrow(/at least one item/);
  });

  it("rejects a non-positive quantity", async () => {
    expect(
      service().create({
        customerId: "c-1",
        items: [{ ...item, quantity: 0 }],
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("walks the happy status path", async () => {
    const svc = service();
    const order = await svc.create({ customerId: "c-1", items: [item] });
    expect((await svc.changeStatus(order.id, "confirmed")).status).toBe("confirmed");
    expect((await svc.changeStatus(order.id, "shipped")).status).toBe("shipped");
  });

  it("rejects an invalid status transition", async () => {
    const svc = service();
    const order = await svc.create({ customerId: "c-1", items: [item] });
    expect(svc.changeStatus(order.id, "shipped")).rejects.toThrow(
      /cannot transition/,
    );
  });

  it("rejects cancelling a shipped order", async () => {
    const svc = service();
    const order = await svc.create({ customerId: "c-1", items: [item] });
    await svc.changeStatus(order.id, "confirmed");
    await svc.changeStatus(order.id, "shipped");
    expect(svc.changeStatus(order.id, "cancelled")).rejects.toThrow(
      /cannot transition/,
    );
  });

  it("throws NotFound for an unknown order", async () => {
    expect(service().getById("nope")).rejects.toThrow(/not found/);
  });

  it("filters the list by customer", async () => {
    const svc = service();
    await svc.create({ customerId: "c-1", items: [item] });
    await svc.create({ customerId: "c-2", items: [item] });
    expect(await svc.list({ customerId: "c-2" })).toHaveLength(1);
  });

  it("caps page size at 200", async () => {
    const svc = service();
    await svc.create({ customerId: "c-1", items: [item] });
    const rows = await svc.list({ limit: 9999 });
    expect(rows.length).toBeLessThanOrEqual(200);
  });

  it("clamps a non-positive limit and offset", async () => {
    const repo = new FakeOrderRepository();
    const svc = new OrderService(repo);
    await svc.create({ customerId: "c-1", items: [item] });
    await svc.list({ limit: 0, offset: -5 });
    // limit must be >= 1 and offset >= 0, otherwise the query returns nothing/negatives
    const calls = repo.listCalls.at(-1)!;
    expect(calls.limit).toBe(1);
    expect(calls.offset).toBe(0);
  });

  it("rejects a status change that lost the race", async () => {
    const repo = new FakeOrderRepository();
    const svc = new OrderService(repo);
    const order = await svc.create({ customerId: "c-1", items: [item] });
    // another writer changes the status after our read
    repo.changeStatus = async () => null;
    expect(svc.changeStatus(order.id, "confirmed")).rejects.toThrow(
      /modified concurrently/,
    );
  });
});

describe("statuses", () => {
  it("keeps cancelled terminal", async () => {
    const svc = service();
    const order = await svc.create({ customerId: "c-1", items: [item] });
    const cancelled = await svc.changeStatus(order.id, "cancelled");
    expect(cancelled.status satisfies OrderStatus).toBe("cancelled");
  });
});
