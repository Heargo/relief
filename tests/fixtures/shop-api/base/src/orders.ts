import type { Order } from "./types";

export function listOrders(): Order[] {
  return [];
}

export function createOrder(id: string): Order {
  return { id, total: 0 };
}
