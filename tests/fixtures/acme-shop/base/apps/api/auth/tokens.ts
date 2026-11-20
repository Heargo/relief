export type Claims = { sub: string };

export function signToken(claims: Claims): string {
  return btoa(JSON.stringify(claims));
}

export function verifyToken(token: string): Claims | null {
  try {
    return JSON.parse(atob(token)) as Claims;
  } catch {
    return null;
  }
}
