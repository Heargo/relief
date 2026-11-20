import { HttpError } from "@acme/shared/http";
import { stripe } from "stripe-sdk";
import { sessions } from "../auth/session";
import type { Invoice } from "./invoice";

export async function chargeCustomer(token: string, invoice: Invoice) {
  const session = await sessions.refresh(token);
  if (!session) throw new HttpError(401, "session expired");
  return stripe.charges.create({
    amount: invoice.total.cents,
    customer: session.stripeId,
  });
}
