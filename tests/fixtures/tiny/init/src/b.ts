import { alpha } from "./a";

export function beta(): number {
  return alpha() + 1;
}

export function betaTwice(): number {
  return beta() * 2;
}
