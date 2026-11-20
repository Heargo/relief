import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { httpPost } from "@acme/shared/http";
import type { Money } from "@acme/shared/money/currency";
import { CartSummary } from "../components/CartSummary";
import { PromoCodeInput } from "../components/PromoCodeInput";

type Cart = { id: string; lines: { unit: number; qty: number }[] };

function Layout({ children }: { children?: any }) {
  return <main>{children}</main>;
}

function useCart(): Cart {
  return { id: "cart-1", lines: [] };
}

function useCheckoutTotals(cart: Cart, code?: string) {
  return useQuery(["totals", cart.id, code],
    () => httpPost("/checkout", { ...cart, code }));
}

export function CheckoutPage() {
  const cart = useCart();
  const [code, setCode] = useState<string>();
  const { total, discount } = useCheckoutTotals(cart, code);
  return (
    <Layout>
      <CartSummary total={total as Money} discount={discount} />
      <PromoCodeInput onApply={setCode} />
    </Layout>
  );
}
