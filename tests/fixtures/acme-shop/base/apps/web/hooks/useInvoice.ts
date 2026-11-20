import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@acme/shared/http";

export function useInvoice(id: string) {
  return useQuery(["invoice", id], () => httpGet(`/invoices/${id}`));
}
