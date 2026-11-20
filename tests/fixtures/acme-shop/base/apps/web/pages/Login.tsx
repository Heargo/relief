import { Button } from "../components/Button";
import { useSession } from "../hooks/useSession";

export function LoginPage() {
  const { data } = useSession();
  return <Button>{data ? "Logout" : "Login"}</Button>;
}
