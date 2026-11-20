import { describe, expect, it } from 'vitest';

import { createBoxGrid } from './box-grid.logic';
import { edgeShape } from './edges.logic';
import type { Rect } from './layout.logic';

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** The test the grid replaces: one label against every box (strict overlap). */
function bruteHits(rects: Rect[], x: number, y: number, hw: number, hh: number): boolean {
  return rects.some(
    (r) => x + hw > r.x && x - hw < r.x + r.w && y + hh > r.y && y - hh < r.y + r.h,
  );
}

function scatter(count: number): Rect[] {
  let seed = 7;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: count }, () =>
    rect(next() * 5000, next() * 3000, 20 + next() * 300, 20 + next() * 200),
  );
}

describe('createBoxGrid', () => {
  it('finds a box under the label and none in an empty place', () => {
    const grid = createBoxGrid([rect(100, 100, 50, 50)]);
    expect(grid.hits(120, 120, 14, 8)).toBe(true);
    expect(grid.hits(400, 400, 14, 8)).toBe(false);
  });

  it('counts a box that only touches the label as a miss, like the full test', () => {
    const grid = createBoxGrid([rect(100, 100, 50, 50)]);
    expect(grid.hits(86, 125, 14, 8)).toBe(false);
    expect(grid.hits(86.5, 125, 14, 8)).toBe(true);
  });

  it('finds a large box from a label far from its corner', () => {
    const grid = createBoxGrid([rect(0, 0, 4000, 4000)], 100);
    expect(grid.hits(3500, 3500, 14, 8)).toBe(true);
  });

  it('answers like the test against every box, on a scatter of boxes', () => {
    const rects = scatter(300);
    const grid = createBoxGrid(rects);
    const probes = scatter(400);
    for (const p of probes) {
      expect(grid.hits(p.x, p.y, 14, 8)).toBe(bruteHits(rects, p.x, p.y, 14, 8));
    }
  });

  it('answers false for no box at all', () => {
    expect(createBoxGrid([]).hits(0, 0, 14, 8)).toBe(false);
  });
});

describe('edgeShape with a grid of boxes', () => {
  it('places the label where the list of boxes places it', () => {
    const a = rect(0, 0, 100, 60);
    const b = rect(600, 40, 100, 60);
    const avoid = [rect(300, -20, 120, 120), rect(250, 0, 40, 40), ...scatter(50)];
    expect(edgeShape(a, b, createBoxGrid(avoid), 0.5)).toEqual(edgeShape(a, b, avoid, 0.5));
  });
});
