import { describe, expect, it } from 'vitest';

import type { SnapshotResponse } from '../../../core/models/contract';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { buildCorridors, roundedPath, routeEdge } from './edge-routing.logic';
import { computeLayouts } from './layout-compute.logic';
import type { LaidOutNode, MapLayout, Rect } from './layout.logic';

// U32, logic seam. New module `edge-routing.logic.ts`:
//  - `buildCorridors(layout: MapLayout): Corridors`: the grid of corridors between the boxes of a
//    layout, as plain data (it is computed in the layout worker and crosses its boundary);
//  - `routeEdge(corridors, from: string, to: string): RoutePoint[] | null`: the route, in world
//    units, from the border of `from` to the border of `to`, made of horizontal and vertical
//    segments only, that crosses no box but `from`, `to` and their ancestors. `null` when there
//    is no corridor (the caller then keeps the direct curve);
//  - `roundedPath(points, radius): string`: SVG path data of a route with rounded corners.

const node = (
  id: string,
  rect: Rect,
  parent: string | null,
  children: string[] = [],
): LaidOutNode => ({
  id,
  kind: children.length > 0 ? 'module' : 'file',
  parent,
  children,
  ...rect,
});

function layoutOf(nodes: LaidOutNode[]): MapLayout {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    roots: nodes.filter((n) => n.parent === null).map((n) => n.id),
    bounds: { x: 0, y: 0, w: 1000, h: 1000 },
  };
}

/** The segments of a route cross the open interior of the rect. */
function crosses(points: { x: number; y: number }[], r: Rect): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h) return true;
  }
  return false;
}

const orthogonal = (points: { x: number; y: number }[]): boolean =>
  points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y);

const onBorder = (p: { x: number; y: number }, r: Rect): boolean => {
  const inX = p.x >= r.x && p.x <= r.x + r.w;
  const inY = p.y >= r.y && p.y <= r.y + r.h;
  return (inX && (p.y === r.y || p.y === r.y + r.h)) || (inY && (p.x === r.x || p.x === r.x + r.w));
};

const A: Rect = { x: 0, y: 100, w: 100, h: 100 };
const B: Rect = { x: 200, y: 100, w: 100, h: 100 };
const C: Rect = { x: 400, y: 100, w: 100, h: 100 };

describe('routeEdge', () => {
  const layout = layoutOf([node('a', A, null), node('b', B, null), node('c', C, null)]);
  const corridors = buildCorridors(layout);

  it('goes around a box that stands between its ends', () => {
    const route = routeEdge(corridors, 'a', 'c');
    expect(route).not.toBeNull();
    expect(crosses(route!, B)).toBe(false);
    expect(crosses(route!, A)).toBe(false);
    expect(crosses(route!, C)).toBe(false);
  });

  it('is made of horizontal and vertical segments, from border to border', () => {
    const route = routeEdge(corridors, 'a', 'c')!;
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(orthogonal(route)).toBe(true);
    expect(onBorder(route[0], A)).toBe(true);
    expect(onBorder(route[route.length - 1], C)).toBe(true);
  });

  it('is a straight run when nothing stands between the ends', () => {
    const route = routeEdge(corridors, 'a', 'b')!;
    expect(orthogonal(route)).toBe(true);
    expect(crosses(route, A) || crosses(route, B) || crosses(route, C)).toBe(false);
  });

  it('gives the same route twice, and a different direction does not cross either', () => {
    expect(routeEdge(corridors, 'a', 'c')).toEqual(routeEdge(corridors, 'a', 'c'));
    expect(routeEdge(buildCorridors(layout), 'a', 'c')).toEqual(routeEdge(corridors, 'a', 'c'));
    const back = routeEdge(corridors, 'c', 'a')!;
    expect(crosses(back, B)).toBe(false);
  });

  it('falls back on null (the direct curve) when no corridor reaches the target', () => {
    // `c` is walled in by four boxes that touch it and each other: nothing to run along.
    const wall = layoutOf([
      node('a', A, null),
      node('c', { x: 400, y: 400, w: 100, h: 100 }, null),
      node('n', { x: 300, y: 300, w: 300, h: 100 }, null),
      node('s', { x: 300, y: 500, w: 300, h: 100 }, null),
      node('w', { x: 300, y: 400, w: 100, h: 100 }, null),
      node('e', { x: 500, y: 400, w: 100, h: 100 }, null),
    ]);
    expect(routeEdge(buildCorridors(wall), 'a', 'c')).toBeNull();
  });

  it('is null for an id that is not in the layout', () => {
    expect(routeEdge(corridors, 'a', 'nope')).toBeNull();
  });

  it('survives a structured clone (it crosses the worker boundary)', () => {
    const cloned = structuredClone(corridors);
    expect(cloned).toEqual(corridors);
    expect(routeEdge(cloned, 'a', 'c')).toEqual(routeEdge(corridors, 'a', 'c'));
    expect(JSON.parse(JSON.stringify(routeEdge(corridors, 'a', 'c')))).toEqual(
      routeEdge(corridors, 'a', 'c'),
    );
  });
});

describe('routeEdge, nested boxes', () => {
  // module `m` holds f1 and f2 with `g` between them; module `n` sits to the right.
  const M: Rect = { x: 0, y: 0, w: 600, h: 300 };
  const F1: Rect = { x: 20, y: 100, w: 100, h: 100 };
  const G: Rect = { x: 200, y: 100, w: 100, h: 100 };
  const F2: Rect = { x: 380, y: 100, w: 100, h: 100 };
  const N: Rect = { x: 800, y: 0, w: 200, h: 300 };
  const H: Rect = { x: 850, y: 100, w: 100, h: 100 };
  const layout = layoutOf([
    node('m', M, null, ['f1', 'g', 'f2']),
    node('f1', F1, 'm'),
    node('g', G, 'm'),
    node('f2', F2, 'm'),
    node('n', N, null, ['h']),
    node('h', H, 'n'),
  ]);
  const corridors = buildCorridors(layout);

  it('runs inside the ancestors of its ends, which are not obstacles', () => {
    const route = routeEdge(corridors, 'f1', 'f2')!;
    expect(route).not.toBeNull();
    expect(crosses(route, G)).toBe(false);
    expect(
      route.every((p) => p.x >= M.x && p.x <= M.x + M.w && p.y >= M.y && p.y <= M.y + M.h),
    ).toBe(true);
  });

  it('does not enter a foreign module, nor the boxes it holds, to reach another box', () => {
    const route = routeEdge(corridors, 'f1', 'h')!;
    expect(route).not.toBeNull();
    expect(crosses(route, G)).toBe(false);
    expect(crosses(route, F2)).toBe(false);
    expect(crosses(route, H)).toBe(false);
  });

  it('may cross the ancestor of the target on its way to it', () => {
    const route = routeEdge(corridors, 'f2', 'h')!;
    expect(onBorder(route[route.length - 1], H)).toBe(true);
    expect(crosses(route, G)).toBe(false);
  });
});

describe('routeEdge, on the acme-shop layout', () => {
  const graph = (acmeShop as unknown as SnapshotResponse).graph;
  const { optimized } = computeLayouts(graph);
  const corridors = buildCorridors(optimized);
  const files = graph.nodes.filter((n) => n.kind === 'file').map((n) => n.id);
  const ancestors = (id: string): Set<string> => {
    const set = new Set<string>([id]);
    for (let p = optimized.nodes.get(id)?.parent; p; p = optimized.nodes.get(p)?.parent) set.add(p);
    return set;
  };

  it('crosses no foreign box on any file import edge it routes', () => {
    const fileOf = (id: string): string | null => {
      for (let cur: string | null | undefined = id; cur; cur = optimized.nodes.get(cur)?.parent) {
        if (files.includes(cur)) return cur;
      }
      return null;
    };
    const pairs = new Map<string, [string, string]>();
    for (const e of graph.edges) {
      if (e.kind !== 'imports') continue;
      const from = fileOf(e.from);
      const to = fileOf(e.to);
      if (from && to && from !== to) pairs.set(`${from}>${to}`, [from, to]);
    }
    expect(pairs.size).toBeGreaterThan(5);
    let routed = 0;
    for (const [from, to] of pairs.values()) {
      const route = routeEdge(corridors, from, to);
      if (!route) continue;
      routed++;
      const own = new Set([...ancestors(from), ...ancestors(to)]);
      for (const n of optimized.nodes.values()) {
        if (own.has(n.id)) continue;
        if (crosses(route, n)) throw new Error(`${from} -> ${to} crosses ${n.id}`);
      }
    }
    expect(routed).toBeGreaterThan(pairs.size / 2);
  });
});

describe('roundedPath', () => {
  it('rounds each corner with a quadratic that has the corner as control point', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10,
    );
    expect(d).toBe('M0,0L90,0Q100,0 100,10L100,100');
  });

  it('caps the radius to half of the shorter segment', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 8 },
      ],
      10,
    );
    expect(d).toBe('M0,0L96,0Q100,0 100,4L100,8');
  });

  it('is a plain line for two points', () => {
    expect(
      roundedPath(
        [
          { x: 0, y: 5 },
          { x: 50, y: 5 },
        ],
        10,
      ),
    ).toBe('M0,5L50,5');
  });
});
