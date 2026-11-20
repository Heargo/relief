import type { FastifyRequest } from "fastify";
import { sessions } from "../auth/session";

function bearer(req: FastifyRequest): string {
  return (req.headers.authorization ?? "").replace("Bearer ", "");
}

export async function requireAuth(req: FastifyRequest) {
  const session = await sessions.refresh(bearer(req));
  req.user = { id: session.userId };
}
