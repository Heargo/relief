import { useParams } from "react-router";
import { useInvoice } from "../hooks/useInvoice";
import { formatDate } from "../utils/dates";
import { formatPrice } from "../utils/format";

export function InvoicesPage() {
  const { data } = useInvoice(useParams().id);
  return (
    <section>
      <h1>{formatDate(new Date(data.issuedAt))}</h1>
      <p>{formatPrice(data.total)}</p>
    </section>
  );
}
