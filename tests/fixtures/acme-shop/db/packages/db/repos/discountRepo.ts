import { eq } from "drizzle-orm";
import { db } from "drizzle-orm/node-postgres";
import { discountsTable } from "../schema/discounts";

export async function findDiscountByCode(code: string) {
  const [row] = await db.select().from(discountsTable)
    .where(eq(discountsTable.code, code.toUpperCase()));
  return row ?? null;
}
