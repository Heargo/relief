import { toCents, type Money } from "@acme/shared/money/currency";

export type DiscountCode = {
  code: string;
  percentOff: number;
  expiresAt?: Date;
};

export function applyDiscount(total: Money, d: DiscountCode): Money {
  if (isExpired(d)) return total;
  const off = Math.round(total.cents * d.percentOff / 100);
  return { ...total, cents: toCents(total.cents - off) };
}

function isExpired(d: DiscountCode, now = new Date()) {
  return d.expiresAt !== undefined && d.expiresAt < now;
}
