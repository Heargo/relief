import type { Money } from "@acme/shared/money/currency";
import { formatPrice } from "../utils/format";

type Props = { total: Money };

export function CartSummary({ total }: Props) {
  return (
    <dl>
      <dt>Total</dt><dd>{formatPrice(total)}</dd>
    </dl>
  );
}
