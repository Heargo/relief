import { toCents, type Money } from "@acme/shared/money/currency";

export function applyLegacyCoupon(total: Money, coupon: string): Money {
  if (coupon !== "WELCOME10") return total;
  return { ...total, cents: toCents(total.cents * 0.9) };
}
