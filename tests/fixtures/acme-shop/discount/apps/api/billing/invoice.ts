import { toCents, type Currency, type Money } from "@acme/shared/money/currency";
import { applyDiscount, type DiscountCode } from "./discount";

export type InvoiceLine = { unit: number; qty: number; currency: Currency };

export type Invoice = { id: string; lines: InvoiceLine[]; total: Money };

export function computeTotal(lines: InvoiceLine[], discount?: DiscountCode): Money {
  const cents = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const total = { cents: toCents(cents), currency: lines[0].currency };
  return discount ? applyDiscount(total, discount) : total;
}

export function renderInvoice(inv: { id: string; lines: InvoiceLine[] }, total: Money): Invoice {
  return { id: inv.id, lines: inv.lines, total };
}
