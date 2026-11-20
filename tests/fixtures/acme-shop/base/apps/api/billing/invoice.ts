import { toCents, type Currency, type Money } from "@acme/shared/money/currency";

export type InvoiceLine = { unit: number; qty: number; currency: Currency };

export type Invoice = { id: string; lines: InvoiceLine[]; total: Money };

export function computeTotal(lines: InvoiceLine[]): Money {
  const cents = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  return { cents: toCents(cents), currency: lines[0].currency };
}

export function renderInvoice(inv: { id: string; lines: InvoiceLine[] }, total: Money): Invoice {
  return { id: inv.id, lines: inv.lines, total };
}
