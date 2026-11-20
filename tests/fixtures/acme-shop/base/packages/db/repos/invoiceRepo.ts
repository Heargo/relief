import { eq } from "drizzle-orm";
import { db } from "drizzle-orm/node-postgres";
import { invoicesTable, type InvoiceRecord } from "../schema/invoices";

export async function findInvoice(id: string): Promise<InvoiceRecord> {
  const [row] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  return row;
}

export async function saveInvoice(invoice: InvoiceRecord) {
  await db.insert(invoicesTable).values(invoice);
}
