import { eq } from "drizzle-orm";
import { db } from "drizzle-orm/node-postgres";
import { usersTable } from "../schema/users";

export async function findUser(idOrEmail: string) {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, idOrEmail));
  return row as { id: string; email: string; stripeId: string };
}
