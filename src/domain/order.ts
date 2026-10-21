export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export function computeTotalCents(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
