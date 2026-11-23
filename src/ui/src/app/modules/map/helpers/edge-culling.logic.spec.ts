import { describe, expect, it } from 'vitest';

import {
  EDGE_MERGE_THRESHOLD,
  edgeBounds,
  edgeInView,
  nearestEdge,
  partitionEdges,
  type EdgeDetail,
} from './edge-culling.logic';

const VIEWPORT = { width: 1000, height: 600 };
const MARGIN = 120;

describe('edgeBounds', () => {
  it('is the box that holds the two boxes the edge joins', () => {
    expect(edgeBounds({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 200, w: 100, h: 50 })).toEqual({
      x: 0,
      y: 0,
      w: 400,
      h: 250,
    });
    expect(edgeBounds({ x: 300, y: 200, w: 100, h: 50 }, { x: 0, y: 0, w: 100, h: 50 })).toEqual({
      x: 0,
      y: 0,
      w: 400,
      h: 250,
    });
  });
});

describe('edgeInView', () => {
  const still = { scale: 1, tx: 0, ty: 0 };

  it('keeps an edge whose box is inside the view', () => {
    expect(edgeInView({ x: 100, y: 100, w: 50, h: 50 }, still, VIEWPORT, MARGIN)).toBe(true);
  });

  it('keeps an edge only part of which is in the view', () => {
    expect(edgeInView({ x: 900, y: 500, w: 800, h: 800 }, still, VIEWPORT, MARGIN)).toBe(true);
  });

  it('keeps an edge that crosses the view without an end in it', () => {
    expect(edgeInView({ x: -5000, y: 100, w: 10000, h: 10 }, still, VIEWPORT, MARGIN)).toBe(true);
  });

  it('keeps an edge just inside the render margin and drops one beyond it', () => {
    expect(edgeInView({ x: 1119, y: 100, w: 50, h: 50 }, still, VIEWPORT, MARGIN)).toBe(true);
    expect(edgeInView({ x: 1121, y: 100, w: 50, h: 50 }, still, VIEWPORT, MARGIN)).toBe(false);
    expect(edgeInView({ x: 100, y: -200, w: 50, h: 81 }, still, VIEWPORT, MARGIN)).toBe(true);
    expect(edgeInView({ x: 100, y: -200, w: 50, h: 81 }, still, VIEWPORT, 0)).toBe(false);
    expect(edgeInView({ x: 100, y: 721, w: 50, h: 50 }, still, VIEWPORT, MARGIN)).toBe(false);
  });

  it('reads the box in world units through the camera', () => {
    // Screen x of the box: 600 * 2 + 100 = 1300, beyond 1000 + 120.
    const camera = { scale: 2, tx: 100, ty: 0 };
    expect(edgeInView({ x: 600, y: 10, w: 10, h: 10 }, camera, VIEWPORT, MARGIN)).toBe(false);
    expect(edgeInView({ x: 500, y: 10, w: 10, h: 10 }, camera, VIEWPORT, MARGIN)).toBe(true);
  });
});

function detail(over: Partial<EdgeDetail> = {}): EdgeDetail {
  return {
    changed: false,
    violations: { introduced: 0, existing: 0 },
    selected: false,
    onImpactPath: false,
    ...over,
  };
}

describe('partitionEdges', () => {
  const many = (n: number, over: (i: number) => Partial<EdgeDetail> = () => ({})) =>
    Array.from({ length: n }, (_, i) => ({ id: i, ...detail(over(i)) }));

  it('has a threshold of 500 edges on screen', () => {
    expect(EDGE_MERGE_THRESHOLD).toBe(500);
  });

  it('draws every edge in full up to the threshold', () => {
    const edges = many(500);
    const { full, merged } = partitionEdges(edges);
    expect(full).toHaveLength(500);
    expect(merged).toHaveLength(0);
  });

  it('merges the unchanged edges beyond the threshold', () => {
    const { full, merged } = partitionEdges(many(501));
    expect(full).toHaveLength(0);
    expect(merged).toHaveLength(501);
  });

  it('keeps the changed, violating, selected and impact-path edges in full', () => {
    const edges = many(600, (i) => {
      if (i === 1) return { changed: true };
      if (i === 2) return { violations: { introduced: 1, existing: 0 } };
      if (i === 3) return { violations: { introduced: 0, existing: 2 } };
      if (i === 4) return { selected: true };
      if (i === 5) return { onImpactPath: true };
      return {};
    });
    const { full, merged } = partitionEdges(edges);
    expect(full.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(merged).toHaveLength(595);
    expect(merged.some((e) => e.id >= 1 && e.id <= 5)).toBe(false);
  });

  it('takes the threshold as an argument', () => {
    const { full, merged } = partitionEdges(many(4), 3);
    expect(full).toHaveLength(0);
    expect(merged).toHaveLength(4);
  });
});

describe('nearestEdge', () => {
  // Straight curves (control point on the segment), in world units.
  const horizontal = { id: 'h', d: 'M0,0Q50,0 100,0' };
  const parallel = { id: 'p', d: 'M0,10Q50,10 100,10' };
  const vertical = { id: 'v', d: 'M200,0Q200,50 200,100' };

  it('finds the edge under the point', () => {
    expect(nearestEdge([horizontal, vertical], { x: 50, y: 3 }, 5)?.id).toBe('h');
    expect(nearestEdge([horizontal, vertical], { x: 198, y: 60 }, 5)?.id).toBe('v');
  });

  it('finds nothing farther than the tolerance', () => {
    expect(nearestEdge([horizontal, vertical], { x: 50, y: 20 }, 5)).toBeNull();
    expect(nearestEdge([horizontal, vertical], { x: 150, y: 0 }, 5)).toBeNull();
  });

  it('picks the nearest of two edges within the tolerance', () => {
    expect(nearestEdge([horizontal, parallel], { x: 50, y: 7 }, 5)?.id).toBe('p');
    expect(nearestEdge([parallel, horizontal], { x: 50, y: 4 }, 5)?.id).toBe('h');
  });

  it('follows the bend of a curve', () => {
    // Quadratic from (0,0) to (100,0) with control (50,100): it passes through (50,50).
    const bent = { id: 'b', d: 'M0,0Q50,100 100,0' };
    expect(nearestEdge([bent], { x: 50, y: 50 }, 3)?.id).toBe('b');
    expect(nearestEdge([bent], { x: 50, y: 0 }, 3)).toBeNull();
  });

  it('finds nothing among no edges', () => {
    expect(nearestEdge([], { x: 0, y: 0 }, 5)).toBeNull();
  });
});
