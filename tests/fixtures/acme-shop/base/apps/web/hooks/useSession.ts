import { useQuery } from "@tanstack/react-query";
import { httpPost } from "@acme/shared/http";

export function useSession() {
  return useQuery(["session"], () => httpPost("/session/refresh", {}));
}
