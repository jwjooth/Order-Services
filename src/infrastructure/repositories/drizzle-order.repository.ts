import { and, desc, eq } from "drizzle-orm";
import type { Order, OrderStatus } from "../../domain/order.ts";
import type {
  ListOrdersQuery,
  OrderRepository,
} from "../../domain/order.repository.ts";
import type { DrizzleDb } from "../db/postgres.ts";
import { type OrderRecord, orders } from "../db/schema.ts";

function toOrder(row: OrderRecord): Order {
  return {
    id: row.id,
    customerId: row.customerId,
    status: row.status as OrderStatus,
    totalCents: Number(row.totalCents),
    items: row.items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: DrizzleDb) {}

  async create(order: Order): Promise<Order> {
    const rows = await this.db
      .insert(orders)
      .values({
        id: order.id,
        customerId: order.customerId,
        status: order.status,
        totalCents: order.totalCents,
        items: order.items,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })
      .returning();

    return toOrder(rows[0]!);
  }

  async findById(id: string): Promise<Order | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    return rows[0] ? toOrder(rows[0]) : null;
  }

  async list(query: ListOrdersQuery): Promise<Order[]> {
    const conditions = [];
    if (query.customerId) {
      conditions.push(eq(orders.customerId, query.customerId));
    }
    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return rows.map(toOrder);
  }

  async changeStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    updatedAt: Date,
  ): Promise<Order | null> {
    const rows = await this.db
      .update(orders)
      .set({
        status: nextStatus,
        updatedAt,
      })
      .where(and(eq(orders.id, id), eq(orders.status, expectedStatus)))
      .returning();

    return rows[0] ? toOrder(rows[0]) : null;
  }
}
