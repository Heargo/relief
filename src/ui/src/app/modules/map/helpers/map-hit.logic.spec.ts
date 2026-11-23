import { describe, expect, it } from 'vitest';

import type { MapScene, SceneEdge, SceneNode, SceneRect } from './map-scene.logic';
import { hitTest } from './map-hit.logic';

const node = (id: string, rect: SceneRect): SceneNode => ({ id, rect }) as SceneNode;

interface EdgeOptions {
  merged?: boolean;
  labelRect?: SceneRect | null;
  covered?: boolean;
}
/** A straight edge from (x0, y0) to (x1, y1), written as the quadratic curve the scene carries. */
const edge = (
  from: string,
  to: string,
  [x0, y0, x1, y1]: [number, number, number, number],
  { merged = false, labelRect = null, covered = false }: EdgeOptions = {},
): SceneEdge =>
  ({
    from,
    to,
    merged,
    labelRect,
    shape: { d: `M${x0},${y0} Q${(x0 + x1) / 2},${(y0 + y1) / 2} ${x1},${y1}`, arrow: '', covered },
  }) as SceneEdge;

const scene = (nodes: SceneNode[], edges: SceneEdge[] = []): MapScene => ({ nodes, edges });

describe('hitTest', () => {
  it('finds nothing on empty ground', () => {
    const s = scene([node('a', { x: 0, y: 0, w: 100, h: 100 })]);
    expect(hitTest(s, { x: 500, y: 500 }, 1)).toBeNull();
  });

  it('finds the node under the point', () => {
    const s = scene([
      node('a', { x: 0, y: 0, w: 100, h: 100 }),
      node('b', { x: 200, y: 0, w: 100, h: 100 }),
    ]);
    expect(hitTest(s, { x: 250, y: 50 }, 1)).toEqual({ kind: 'node', id: 'b' });
  });

  it('prefers the smallest node when boxes are nested', () => {
    const s = scene([
      node('outer', { x: 0, y: 0, w: 400, h: 400 }),
      node('middle', { x: 50, y: 50, w: 200, h: 200 }),
      node('inner', { x: 100, y: 100, w: 50, h: 50 }),
    ]);
    expect(hitTest(s, { x: 120, y: 120 }, 1)).toEqual({ kind: 'node', id: 'inner' });
    expect(hitTest(s, { x: 200, y: 200 }, 1)).toEqual({ kind: 'node', id: 'middle' });
    expect(hitTest(s, { x: 10, y: 10 }, 1)).toEqual({ kind: 'node', id: 'outer' });
  });

  it('prefers the label of an edge over the node under it', () => {
    const s = scene(
      [node('a', { x: 0, y: 0, w: 400, h: 400 })],
      [
        edge('x', 'y', [0, 300, 400, 300], {
          labelRect: { x: 190, y: 150, w: 28, h: 16 },
        }),
      ],
    );
    expect(hitTest(s, { x: 200, y: 158 }, 1)).toEqual({ kind: 'label', from: 'x', to: 'y' });
    expect(hitTest(s, { x: 200, y: 100 }, 1)).toEqual({ kind: 'node', id: 'a' });
  });

  it('ignores the label of an edge when it is covered', () => {
    const s = scene(
      [node('a', { x: 0, y: 0, w: 400, h: 400 })],
      [
        edge('x', 'y', [0, 300, 400, 300], {
          labelRect: { x: 190, y: 150, w: 28, h: 16 },
          covered: true,
        }),
      ],
    );
    expect(hitTest(s, { x: 200, y: 158 }, 1)).toEqual({ kind: 'node', id: 'a' });
  });

  it('picks an edge within 6 screen pixels of its curve', () => {
    const s = scene([], [edge('a', 'b', [0, 0, 100, 0])]);
    expect(hitTest(s, { x: 50, y: 5 }, 1)).toEqual({ kind: 'edge', from: 'a', to: 'b' });
    expect(hitTest(s, { x: 50, y: 8 }, 1)).toBeNull();
  });

  it('measures the reach of an edge in screen pixels, whatever the zoom', () => {
    const s = scene([], [edge('a', 'b', [0, 0, 100, 0])]);
    // At scale 2, 6 screen pixels are 3 world units.
    expect(hitTest(s, { x: 50, y: 2.5 }, 2)).toEqual({ kind: 'edge', from: 'a', to: 'b' });
    expect(hitTest(s, { x: 50, y: 4 }, 2)).toBeNull();
    // At scale 0.5, they are 12 world units.
    expect(hitTest(s, { x: 50, y: 11 }, 0.5)).toEqual({ kind: 'edge', from: 'a', to: 'b' });
  });

  it('picks the nearest of two edges', () => {
    const s = scene([], [edge('a', 'b', [0, 0, 100, 0]), edge('c', 'd', [0, 4, 100, 4])]);
    expect(hitTest(s, { x: 50, y: 3 }, 1)).toEqual({ kind: 'edge', from: 'c', to: 'd' });
  });

  it('picks a merged edge like a full one', () => {
    const s = scene([], [edge('a', 'b', [0, 0, 100, 0], { merged: true })]);
    expect(hitTest(s, { x: 50, y: 4 }, 1)).toEqual({ kind: 'edge', from: 'a', to: 'b' });
  });

  it('prefers an edge close to the point over the node under it', () => {
    const s = scene(
      [node('a', { x: 0, y: 0, w: 400, h: 400 })],
      [edge('x', 'y', [0, 200, 400, 200])],
    );
    expect(hitTest(s, { x: 100, y: 203 }, 1)).toEqual({ kind: 'edge', from: 'x', to: 'y' });
  });
});
