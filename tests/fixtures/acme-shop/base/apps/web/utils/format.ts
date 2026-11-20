import type { Money } from "@acme/shared/money/currency";

export function formatPrice(m: Money, locale = "fr-FR") {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency: m.currency,
  }).format(m.cents / 100);
}
