import type { Order } from "./types";

export function listOrders(): Order[] {
  return [];
}

export function createOrder(id: string, lines: number[] = []): Order {
  return { id, total: lines.reduce((sum, line) => sum + line, 0) };
}
