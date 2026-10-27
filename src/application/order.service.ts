import {
  canTransition,
  computeTotalCents,
  type Order,
  type OrderStatus,
} from "../domain/order.ts";
import type { OrderRepository } from "../domain/order.repository.ts";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../shared/errors.ts";

export interface CreateOrderInput {
  customerId: string;
  items: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
}

export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateOrderInput): Promise<Order> {
    if (!input.customerId.trim()) {
      throw new ValidationError("customerId is required");
    }
    if (input.items.length === 0) {
      throw new ValidationError("order must contain at least one item");
    }
    for (const item of input.items) {
      if (!item.sku.trim()) throw new ValidationError("item sku is required");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ValidationError("item quantity must be a positive integer");
      }
      if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
        throw new ValidationError(
          "item unitPriceCents must be a non-negative integer",
        );
      }
    }

    const timestamp = this.now();
    const order: Order = {
      id: crypto.randomUUID(),
      customerId: input.customerId,
      items: input.items,
      status: "pending",
      totalCents: computeTotalCents(input.items),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.repo.create(order);
  }

  async getById(id: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError(`order ${id} not found`);
    return order;
  }

  async list(query: {
    customerId?: string;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
  }): Promise<Order[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    return this.repo.list({
      customerId: query.customerId,
      status: query.status,
      limit,
      offset,
    });
  }

  async changeStatus(id: string, next: OrderStatus): Promise<Order> {
    const order = await this.getById(id);
    if (order.status === next) {
      throw new ConflictError(`order ${id} is already ${next}`);
    }
    if (!canTransition(order.status, next)) {
      throw new ConflictError(
        `cannot transition order from ${order.status} to ${next}`,
      );
    }
    // guarded update: fails if the status changed between read and write
    const updated = await this.repo.changeStatus(
      id,
      order.status,
      next,
      this.now(),
    );
    if (!updated) {
      throw new ConflictError(`order ${id} was modified concurrently`);
    }
    return updated;
  }
}
