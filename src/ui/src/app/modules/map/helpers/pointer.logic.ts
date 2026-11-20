export interface Point {
  x: number;
  y: number;
}

/** Largest pointer travel (px) still taken for a click rather than a drag. */
export const CLICK_TOLERANCE = 4;

/** A press and release this close together is a click, not a pan. */
export function isClick(down: Point, up: Point): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_TOLERANCE;
}
