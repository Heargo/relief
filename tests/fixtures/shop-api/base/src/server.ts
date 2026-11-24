import { listOrders } from "./orders";

function ordersHandler() {
  return listOrders();
}

export function registerRoutes(app: { get(path: string, handler: () => unknown): void }) {
  app.get("/orders", ordersHandler);
}
