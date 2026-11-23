import { describe, expect, it, vi } from 'vitest';

import type { BoxGrid } from './box-grid.logic';
import { edgeLabelNeedsPlacement, edgeLabelVisible, edgeShape } from './edges.logic';

// S22: the label of an edge is placed against the boxes only when the edge is long enough on
// screen to show it (the 60 px threshold of `edgeLabelVisible`).
describe('edgeLabelNeedsPlacement', () => {
  it('is false up to 60 px and true above', () => {
    expect(edgeLabelNeedsPlacement(0)).toBe(false);
    expect(edgeLabelNeedsPlacement(60)).toBe(false);
    expect(edgeLabelNeedsPlacement(61)).toBe(true);
  });

  it('agrees with the length at which a label is written', () => {
    for (const length of [0, 10, 59.9, 60, 60.1, 61, 300]) {
      expect(edgeLabelNeedsPlacement(length)).toBe(edgeLabelVisible('5', length));
    }
  });
});

describe('edgeShape label placement against the boxes', () => {
  const grid = (hit: boolean) => {
    const hits = vi.fn(() => hit);
    return { grid: { hits } as BoxGrid, hits };
  };
  // Borders 40 px apart at scale 1 (short), and 320 px apart (long).
  const A = { x: 0, y: 0, w: 40, h: 40 };
  const SHORT_B = { x: 80, y: 0, w: 40, h: 40 };
  const LONG_B = { x: 360, y: 0, w: 40, h: 40 };

  it('does not look at the boxes for an edge too short to show its label', () => {
    const { grid: g, hits } = grid(true);
    const shape = edgeShape(A, SHORT_B, g);
    expect(hits).not.toHaveBeenCalled();
    expect(shape.length).toBeCloseTo(40, 6);
    expect(shape.covered).toBe(false);
  });

  it('keeps a short edge label mid-curve whatever the boxes', () => {
    const { grid: g } = grid(true);
    expect(edgeShape(A, SHORT_B, g)).toEqual(edgeShape(A, SHORT_B));
  });

  it('judges the length on screen: the same boxes are short at scale 1 and long at scale 2', () => {
    const near = { x: 60, y: 0, w: 40, h: 40 }; // 20 world units apart
    const g1 = grid(false);
    edgeShape(A, near, g1.grid, 1);
    expect(g1.hits).not.toHaveBeenCalled();
    const g2 = grid(false);
    edgeShape(A, near, g2.grid, 4);
    expect(g2.hits).toHaveBeenCalled();
  });

  it('still slides the label of a long edge off the boxes', () => {
    const real: BoxGrid = {
      hits: (x, y, hw, hh) => x + hw > 170 && x - hw < 230 && y + hh > 30 && y - hh < 70,
    };
    const shape = edgeShape(A, LONG_B, real);
    expect(shape.mx).toBeCloseTo(136, 3);
    expect(shape.my).toBeCloseTo(44.192, 3);
    expect(shape.covered).toBe(false);
  });
});
