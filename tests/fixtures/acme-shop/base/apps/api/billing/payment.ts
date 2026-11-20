import { stripe } from "stripe-sdk";
import { sessions } from "../auth/session";
import type { Invoice } from "./invoice";

export async function chargeCustomer(token: string, invoice: Invoice) {
  const session = await sessions.refresh(token);
  return stripe.charges.create({
    amount: invoice.total.cents,
    customer: session.stripeId,
  });
}
