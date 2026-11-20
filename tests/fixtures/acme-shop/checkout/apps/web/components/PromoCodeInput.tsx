import { useState } from "react";
import { findDiscountByCode } from "@acme/db/repos/discountRepo";
import { httpPost } from "@acme/shared/http";
import { Button } from "./Button";

type Props = { onApply: (code: string) => void };

async function validateCodeLocally(code: string) {
  return (await findDiscountByCode(code)) !== null;
}

export function PromoCodeInput({ onApply }: Props) {
  const [code, setCode] = useState("");
  async function submit() {
    if (!(await validateCodeLocally(code))) return;
    const res = await httpPost("/promo/validate", { code });
    if (res.valid) onApply(code);
  }
  return (
    <form onSubmit={submit}>
      <input value={code} onChange={(e: any) => setCode(e.target.value)} />
      <Button type="submit">Appliquer</Button>
    </form>
  );
}
