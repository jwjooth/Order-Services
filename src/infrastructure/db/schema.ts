import {
  bigint,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { OrderItem } from "../../domain/order.ts";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  status: text("status").notNull(),
  totalCents: bigint("total_cents", { mode: "number" }).notNull(),
  items: jsonb("items").$type<OrderItem[]>().notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export type OrderRecord = typeof orders.$inferSelect;
export type NewOrderRecord = typeof orders.$inferInsert;
