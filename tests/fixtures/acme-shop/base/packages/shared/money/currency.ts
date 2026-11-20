export type Currency = "EUR" | "USD" | "GBP";

export type Money = { cents: number; currency: Currency };

export function toCents(amount: number): number {
  return Math.round(amount);
}
