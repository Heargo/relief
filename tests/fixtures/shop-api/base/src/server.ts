import { listOrders } from "./orders";

export function registerRoutes(app: { get(path: string, handler: () => unknown): void }) {
  app.get("/orders", listOrders);
}
