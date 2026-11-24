import { loadOrders, renderOrders } from "./OrderList";

export async function main(): Promise<string> {
  return renderOrders(await loadOrders());
}
