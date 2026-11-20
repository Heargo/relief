import { eq } from "drizzle-orm";
import { db } from "drizzle-orm/node-postgres";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { findInvoice } from "@acme/db/repos/invoiceRepo";
import { invoicesTable } from "@acme/db/schema/invoices";
import { computeTotal, renderInvoice } from "../billing/invoice";
import { requireAuth } from "./middleware";

async function getInvoice(req: FastifyRequest) {
  const inv = await findInvoice(req.params.id);
  return renderInvoice(inv, computeTotal(inv.lines));
}

async function listInvoices(req: FastifyRequest) {
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.ownerId, req.user.id));
  return Promise.all(rows.map((r: { id: string }) => findInvoice(r.id)));
}

export function registerInvoiceRoutes(app: FastifyInstance) {
  app.get("/invoices/:id", { preHandler: requireAuth }, getInvoice);
  app.get("/invoices", { preHandler: requireAuth }, listInvoices);
}
