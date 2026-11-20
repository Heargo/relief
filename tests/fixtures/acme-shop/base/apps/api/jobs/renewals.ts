import { findUser } from "@acme/db/repos/userRepo";
import { sessions } from "../auth/session";
import { computeTotal, type Invoice } from "../billing/invoice";
import { chargeCustomer } from "../billing/payment";

type Subscription = { serviceToken: string; ownerId: string; lines: Invoice["lines"] };

async function dueSubscriptions(): Promise<Subscription[]> {
  return [];
}

function buildInvoice(sub: Subscription, userId: string): Invoice {
  return { id: `renewal-${userId}`, lines: sub.lines, total: computeTotal(sub.lines) };
}

export async function renewSubscriptions() {
  for (const sub of await dueSubscriptions()) {
    const session = await sessions.refresh(sub.serviceToken);
    await findUser(session.userId);
    await chargeCustomer(sub.serviceToken, buildInvoice(sub, session.userId));
  }
}
