import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const discountsTable = pgTable("discounts", {
  code: text("code").primaryKey(),
  percentOff: integer("percent_off").notNull(),
  expiresAt: timestamp("expires_at"),
});
