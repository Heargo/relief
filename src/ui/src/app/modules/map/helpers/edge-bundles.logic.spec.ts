import { describe, expect, it } from 'vitest';

import type { DiffStatus } from '../../review/helpers/diff-layer.logic';
import {
  BUNDLE_MIN,
  BUNDLE_TRUNK_LENGTH,
  bundleEdges,
  entrySide,
  portPoint,
  type BundleInput,
} from './edge-bundles.logic';
import type { Rect } from './layout.logic';

// U31: edges entering (or leaving) the same box by the same side converge on a port in the middle
// of that side and share a trunk of BUNDLE_TRUNK_LENGTH world units, perpendicular to the side.
// A bundle needs BUNDLE_MIN (3) edges. Pure geometry, in world units.

const HUB: Rect = { x: 300, y: 0, w: 100, h: 100 }; // center (350, 50)
const A: Rect = { x: 0, y: 0, w: 100, h: 100 }; // center (50, 50): straight to the left of HUB
const B: Rect = { x: 0, y: 150, w: 100, h: 100 }; // center (50, 200)
const C: Rect = { x: 0, y: -150, w: 100, h: 100 }; // center (50, -100)

const rects = (entries: Record<string, Rect>): Map<string, Rect> =>
  new Map(Object.entries(entries));
const e = (from: string, to: string, status: DiffStatus = 'unchanged'): BundleInput => ({
  from,
  to,
  status,
});

describe('entrySide and portPoint', () => {
  it('names the side of the box that faces the other box', () => {
    expect(entrySide(HUB, A)).toBe('left');
    expect(entrySide(HUB, { x: 600, y: 0, w: 100, h: 100 })).toBe('right');
    expect(entrySide(HUB, { x: 300, y: -400, w: 100, h: 100 })).toBe('top');
    expect(entrySide(HUB, { x: 300, y: 400, w: 100, h: 100 })).toBe('bottom');
  });

  it('weighs the axes by the size of the box: a wide box is entered from the top first', () => {
    const wide: Rect = { x: 0, y: 0, w: 1000, h: 100 }; // center (500, 50)
    // dx = 300, dy = -200: 300/500 < 200/50 -> vertical
    expect(entrySide(wide, { x: 650, y: -300, w: 100, h: 100 })).toBe('top');
  });

  it('puts the port in the middle of a side', () => {
    expect(portPoint(HUB, 'left')).toEqual({ x: 300, y: 50 });
    expect(portPoint(HUB, 'right')).toEqual({ x: 400, y: 50 });
    expect(portPoint(HUB, 'top')).toEqual({ x: 350, y: 0 });
    expect(portPoint(HUB, 'bottom')).toEqual({ x: 350, y: 100 });
  });
});

describe('bundleEdges', () => {
  it('has a threshold of 3 edges and a trunk of 40 world units', () => {
    expect(BUNDLE_MIN).toBe(3);
    expect(BUNDLE_TRUNK_LENGTH).toBe(40);
  });

  it('makes no bundle of two edges into the same box', () => {
    expect(bundleEdges([e('a', 'hub'), e('b', 'hub')], rects({ a: A, b: B, hub: HUB }))).toEqual(
      [],
    );
  });

  it('bundles three edges that enter a box by the same side', () => {
    const bundles = bundleEdges(
      [e('a', 'hub'), e('b', 'hub'), e('c', 'hub')],
      rects({ a: A, b: B, c: C, hub: HUB }),
    );
    expect(bundles).toHaveLength(1);
    const bundle = bundles[0];
    expect(bundle).toMatchObject({
      id: 'in:hub:left',
      box: 'hub',
      side: 'left',
      end: 'in',
      count: 3,
      added: 0,
      status: 'unchanged',
      mixed: false,
      port: { x: 300, y: 50 },
    });
    expect(bundle.branches.map((b) => [b.from, b.to])).toEqual([
      ['a', 'hub'],
      ['b', 'hub'],
      ['c', 'hub'],
    ]);
  });

  it('runs the trunk from the end of the stub to the port, and the branches onto the stub', () => {
    const [bundle] = bundleEdges(
      [e('a', 'hub'), e('b', 'hub'), e('c', 'hub')],
      rects({ a: A, b: B, c: C, hub: HUB }),
    );
    expect(bundle.trunk).toEqual({
      from: { x: 260, y: 50 },
      to: { x: 300, y: 50 },
      d: 'M260,50Q280,50 300,50',
    });
    expect(bundle.mid).toEqual({ x: 280, y: 50 });
    // straight branch from the border of the source to the free end of the trunk, as a quadratic
    expect(bundle.branches[0].d).toBe('M100,50Q180,50 260,50');
    for (const branch of bundle.branches) expect(branch.d.endsWith('260,50')).toBe(true);
  });

  it('bundles the edges that leave a box by the same side, the trunk running out of the port', () => {
    const right = (y: number): Rect => ({ x: 300, y, w: 100, h: 100 });
    const bundles = bundleEdges(
      [e('a', 'h1'), e('a', 'h2'), e('a', 'h3')],
      rects({ a: A, h1: right(-200), h2: right(0), h3: right(200) }),
    );
    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatchObject({
      id: 'out:a:right',
      box: 'a',
      side: 'right',
      end: 'out',
      count: 3,
      port: { x: 100, y: 50 },
    });
    expect(bundles[0].trunk).toEqual({
      from: { x: 100, y: 50 },
      to: { x: 140, y: 50 },
      d: 'M100,50Q120,50 140,50',
    });
    for (const branch of bundles[0].branches) expect(branch.d.startsWith('M140,50Q')).toBe(true);
  });

  it('does not bundle edges that enter by different sides', () => {
    const above: Rect = { x: 300, y: -400, w: 100, h: 100 };
    const edges = [e('a', 'hub'), e('b', 'hub'), e('up', 'hub')];
    expect(bundleEdges(edges, rects({ a: A, b: B, up: above, hub: HUB }))).toEqual([]);
  });

  it('bundles on the side where three arrive when a fourth comes from elsewhere', () => {
    const above: Rect = { x: 300, y: -400, w: 100, h: 100 };
    const bundles = bundleEdges(
      [e('a', 'hub'), e('b', 'hub'), e('c', 'hub'), e('up', 'hub')],
      rects({ a: A, b: B, c: C, up: above, hub: HUB }),
    );
    expect(bundles.map((b) => [b.id, b.count])).toEqual([['in:hub:left', 3]]);
  });

  it('ignores an edge whose end has no rect', () => {
    expect(
      bundleEdges(
        [e('a', 'hub'), e('b', 'hub'), e('ghost', 'hub')],
        rects({ a: A, b: B, hub: HUB }),
      ),
    ).toEqual([]);
  });

  it('puts an edge in one bundle only: the larger wins, the other loses the edge', () => {
    // hub receives a, b, c on its left (3); a also sends to x and y, to its right (3 with hub).
    const x: Rect = { x: 300, y: 300, w: 100, h: 100 };
    const y: Rect = { x: 300, y: -300, w: 100, h: 100 };
    const bundles = bundleEdges(
      [e('a', 'hub'), e('b', 'hub'), e('c', 'hub'), e('a', 'x'), e('a', 'y')],
      rects({ a: A, b: B, c: C, x, y, hub: HUB }),
    );
    // in:hub:left (3) takes a -> hub; out:a:right keeps 2 edges, under the threshold
    expect(bundles.map((b) => b.id)).toEqual(['in:hub:left']);
    expect(bundles[0].branches).toHaveLength(3);
  });

  it('is deterministic: the order of the input does not change the bundles', () => {
    const r = rects({ a: A, b: B, c: C, hub: HUB });
    const forward = bundleEdges([e('a', 'hub'), e('b', 'hub'), e('c', 'hub')], r);
    const backward = bundleEdges([e('c', 'hub'), e('b', 'hub'), e('a', 'hub')], r);
    expect(backward).toEqual(forward);
  });

  it('counts the new edges and takes the majority status', () => {
    const [bundle] = bundleEdges(
      [e('a', 'hub', 'added'), e('b', 'hub', 'added'), e('c', 'hub')],
      rects({ a: A, b: B, c: C, hub: HUB }),
    );
    expect(bundle).toMatchObject({ count: 3, added: 2, status: 'added', mixed: true });
  });

  it('is not mixed when every edge has the same status', () => {
    const [bundle] = bundleEdges(
      [e('a', 'hub', 'added'), e('b', 'hub', 'added'), e('c', 'hub', 'added')],
      rects({ a: A, b: B, c: C, hub: HUB }),
    );
    expect(bundle).toMatchObject({ added: 3, status: 'added', mixed: false });
  });

  it('lets the change win a tie between statuses', () => {
    const D: Rect = { x: 0, y: 300, w: 100, h: 100 };
    const [bundle] = bundleEdges(
      [e('a', 'hub', 'added'), e('b', 'hub', 'added'), e('c', 'hub'), e('d', 'hub')],
      rects({ a: A, b: B, c: C, d: D, hub: HUB }),
    );
    expect(bundle).toMatchObject({ count: 4, status: 'added', mixed: true });
  });
});
