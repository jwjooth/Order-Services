import type { OrderService } from "../../application/order.service.ts";
import type { OrderStatus } from "../../domain/order.ts";

export class OrderController {
  constructor(private readonly service: OrderService) {}

  async create(body: {
    customerId: string;
    items: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
  }) {
    return this.service.create(body);
  }

  async getById(id: string) {
    return this.service.getById(id);
  }

  async list(query: {
    customerId?: string;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
  }) {
    return this.service.list(query);
  }

  async changeStatus(id: string, status: OrderStatus) {
    return this.service.changeStatus(id, status);
  }
}
