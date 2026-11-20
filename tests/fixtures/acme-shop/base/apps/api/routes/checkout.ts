import type { FastifyInstance, FastifyRequest } from "fastify";
import { computeTotal } from "../billing/invoice";
import { applyLegacyCoupon } from "../billing/legacyCoupon";
import { chargeCustomer } from "../billing/payment";
import { requireAuth } from "./middleware";

async function postCheckout(req: FastifyRequest) {
  let total = computeTotal(req.body.lines);
  if (req.body.coupon) total = applyLegacyCoupon(total, req.body.coupon);
  return chargeCustomer(req.headers.authorization, { ...req.body, total });
}

export function registerCheckoutRoutes(app: FastifyInstance) {
  app.post("/checkout", { preHandler: requireAuth }, postCheckout);
}
