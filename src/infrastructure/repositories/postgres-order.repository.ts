import type { Db } from "../db/postgres.ts";
import type { Order, OrderStatus } from "../../domain/order.ts";
import type {
  ListOrdersQuery,
  OrderRepository,
} from "../../domain/order.repository.ts";

interface OrderRow {
  id: string;
  customer_id: string;
  status: OrderStatus;
  total_cents: number | string;
  items: Order["items"];
  created_at: Date;
  updated_at: Date;
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    totalCents: Number(row.total_cents),
    items: row.items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly db: Db) {}

  async create(order: Order): Promise<Order> {
    const rows = await this.db<OrderRow[]>`
      INSERT INTO orders (id, customer_id, status, total_cents, items, created_at, updated_at)
      VALUES (${order.id}, ${order.customerId}, ${order.status}, ${order.totalCents},
              ${this.db.json(order.items as unknown as Parameters<Db["json"]>[0])}, ${order.createdAt}, ${order.updatedAt})
      RETURNING *
    `;
    return toOrder(rows[0]!);
  }

  async findById(id: string): Promise<Order | null> {
    const rows = await this.db<OrderRow[]>`
      SELECT * FROM orders WHERE id = ${id}
    `;
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async list(query: ListOrdersQuery): Promise<Order[]> {
    const rows = await this.db<OrderRow[]>`
      SELECT * FROM orders
      WHERE (${query.customerId ?? null}::text IS NULL OR customer_id = ${query.customerId ?? null})
        AND (${query.status ?? null}::text IS NULL OR status = ${query.status ?? null})
      ORDER BY created_at DESC
      LIMIT ${query.limit} OFFSET ${query.offset}
    `;
    return rows.map(toOrder);
  }

  async changeStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    updatedAt: Date,
  ): Promise<Order | null> {
    const rows = await this.db<OrderRow[]>`
      UPDATE orders
      SET status = ${nextStatus}, updated_at = ${updatedAt}
      WHERE id = ${id} AND status = ${expectedStatus}
      RETURNING *
    `;
    return rows[0] ? toOrder(rows[0]) : null;
  }
}
