import type { Rect } from './layout.logic';

/** The boxes an edge label must not sit on, indexed by cell so a label meets only its neighbours. */
export interface BoxGrid {
  /** A box strictly overlaps the label centred on (x, y) with these half sizes. */
  hits(x: number, y: number, halfW: number, halfH: number): boolean;
}

const DEFAULT_CELL = 200;
/** A box spread over more cells than this is kept apart and tested directly. */
const MAX_CELLS = 64;

export function createBoxGrid(rects: readonly Rect[], cell: number = DEFAULT_CELL): BoxGrid {
  const cells = new Map<string, Rect[]>();
  const large: Rect[] = [];
  for (const r of rects) {
    const x0 = Math.floor(r.x / cell);
    const x1 = Math.floor((r.x + r.w) / cell);
    const y0 = Math.floor(r.y / cell);
    const y1 = Math.floor((r.y + r.h) / cell);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
      large.push(r);
      continue;
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx},${cy}`;
        const list = cells.get(key);
        if (list) list.push(r);
        else cells.set(key, [r]);
      }
    }
  }
  const overlaps = (r: Rect, x: number, y: number, hw: number, hh: number): boolean =>
    x + hw > r.x && x - hw < r.x + r.w && y + hh > r.y && y - hh < r.y + r.h;
  return {
    hits(x, y, hw, hh) {
      for (const r of large) if (overlaps(r, x, y, hw, hh)) return true;
      const x0 = Math.floor((x - hw) / cell);
      const x1 = Math.floor((x + hw) / cell);
      const y0 = Math.floor((y - hh) / cell);
      const y1 = Math.floor((y + hh) / cell);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const list = cells.get(`${cx},${cy}`);
          if (list) for (const r of list) if (overlaps(r, x, y, hw, hh)) return true;
        }
      }
      return false;
    },
  };
}
