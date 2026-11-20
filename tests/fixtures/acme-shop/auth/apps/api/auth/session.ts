import { findUser } from "@acme/db/repos/userRepo";
import { signToken, verifyToken } from "./tokens";

export class SessionExpiredError extends Error {}

export type Session = { userId: string; stripeId: string };

export class SessionStore {
  async login(email: string): Promise<Session & { token: string }> {
    const user = await findUser(email);
    const token = signToken({ sub: user.id });
    return { ...(await this.load(user.id)), token };
  }

  async refresh(token: string): Promise<Session | null> {
    const claims = verifyToken(token);
    if (!claims) return null;
    return this.load(claims.sub);
  }

  private async load(userId: string): Promise<Session> {
    const user = await findUser(userId);
    return { userId: user.id, stripeId: user.stripeId };
  }
}

export const sessions = new SessionStore();
