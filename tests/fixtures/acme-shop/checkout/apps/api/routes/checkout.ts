import type { FastifyInstance, FastifyRequest } from "fastify";
import { findDiscountByCode } from "@acme/db/repos/discountRepo";
import { computeTotal } from "../billing/invoice";
import { chargeCustomer } from "../billing/payment";
import { requireAuth } from "./middleware";

async function postCheckout(req: FastifyRequest) {
  const discount = req.body.code
    ? (await findDiscountByCode(req.body.code)) ?? undefined : undefined;
  const total = computeTotal(req.body.lines, discount);

  return chargeCustomer(req.headers.authorization, { ...req.body, total });
}

async function postPromoValidate(req: FastifyRequest) {
  const d = await findDiscountByCode(req.body.code);
  if (!d) return { valid: false };
  return { valid: true, percentOff: d.percentOff };
}

export function registerCheckoutRoutes(app: FastifyInstance) {
  app.post("/checkout", { preHandler: requireAuth }, postCheckout);
  app.post("/promo/validate", postPromoValidate);
}
