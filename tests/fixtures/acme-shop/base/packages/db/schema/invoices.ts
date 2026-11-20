import { integer, pgTable, text } from "drizzle-orm/pg-core";

export type InvoiceRecord = {
  id: string;
  ownerId: string;
  lines: { unit: number; qty: number; currency: "EUR" | "USD" | "GBP" }[];
  discount?: { code: string; percentOff: number; expiresAt?: Date };
};

export const invoicesTable = pgTable("invoices", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  totalCents: integer("total_cents").notNull(),
});
