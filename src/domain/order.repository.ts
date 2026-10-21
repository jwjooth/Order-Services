import type { Order, OrderStatus } from "./order.ts";

export interface ListOrdersQuery {
  customerId?: string;
  status?: OrderStatus;
  limit: number;
  offset: number;
}

export interface OrderRepository {
  create(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  list(query: ListOrdersQuery): Promise<Order[]>;
  /**
   * Persists a status change only if the stored status still equals `expectedStatus`.
   * Returns null when the row changed concurrently (lost-update guard).
   */
  changeStatus(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    updatedAt: Date,
  ): Promise<Order | null>;
}
