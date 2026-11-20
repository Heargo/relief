import { useQuery } from "@tanstack/react-query";
import { httpPost } from "@acme/shared/http";
import type { Money } from "@acme/shared/money/currency";
import { CartSummary } from "../components/CartSummary";

type Cart = { id: string; lines: { unit: number; qty: number }[] };

function Layout({ children }: { children?: any }) {
  return <main>{children}</main>;
}

function useCart(): Cart {
  return { id: "cart-1", lines: [] };
}

function useCheckoutTotals(cart: Cart) {
  return useQuery(["totals", cart.id], () => httpPost("/checkout", cart));
}

export function CheckoutPage() {
  const cart = useCart();
  const { total } = useCheckoutTotals(cart);
  return (
    <Layout>
      <CartSummary total={total as Money} />
    </Layout>
  );
}
