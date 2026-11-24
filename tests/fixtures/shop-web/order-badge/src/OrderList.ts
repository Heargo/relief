import type { Order } from "@shop/api";

export async function loadOrders(): Promise<Order[]> {
  const res = await fetch("/orders");
  return res.json();
}

export function renderOrders(orders: Order[]): string {
  return `(${orders.length}) ` + orders.map((o) => o.id).join(", ");
}
