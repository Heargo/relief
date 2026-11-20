import { formatPrice } from "@acme/shared/money";
import type { Money } from "@acme/shared/money/currency";

type Props = { total: Money; discount?: { percentOff: number } };

export function CartSummary({ total, discount }: Props) {
  return (
    <dl>
      <dt>Total</dt><dd>{formatPrice(total)}</dd>
      {discount && <><dt>Remise</dt><dd>−{discount.percentOff} %</dd></>}
    </dl>
  );
}
