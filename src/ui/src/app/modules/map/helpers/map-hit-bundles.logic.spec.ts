import { describe, expect, it } from 'vitest';

import type { EdgeBundle } from './edge-bundles.logic';
import type { MapScene, SceneEdge, SceneNode } from './map-scene.logic';
import { hitTest } from './map-hit.logic';

// U31: the hit-test touches the individual edge near its end (on its branch), the bundle on its
// trunk. A hovered or selected branch is an edge hit; the trunk is a `bundle` hit.

const curve = (x0: number, y0: number, x1: number, y1: number): string =>
  `M${x0},${y0}Q${(x0 + x1) / 2},${(y0 + y1) / 2} ${x1},${y1}`;

// The hub box sits at x 300..400; the trunk runs from (260, 50) to the port (300, 50).
// Branches: a at y = 50 (from x 100) and b going down-left (from (100, 300)).
const bundle = {
  id: 'in:hub:left',
  box: 'hub',
  side: 'left',
  end: 'in',
  count: 2,
  trunk: { d: curve(260, 50, 300, 50) },
  branches: [
    { from: 'a', to: 'hub', d: curve(100, 50, 260, 50) },
    { from: 'b', to: 'hub', d: curve(100, 300, 260, 50) },
  ],
} as unknown as EdgeBundle;

const branchEdge = (from: string): SceneEdge =>
  ({
    from,
    to: 'hub',
    merged: false,
    labelRect: null,
    bundle: 'in:hub:left',
    // what a bundled edge would draw alone: never hit-tested at its own (unbundled) curve
    shape: { d: curve(0, 900, 10, 900), arrow: '', covered: false },
  }) as unknown as SceneEdge;

const scene: MapScene = {
  nodes: [{ id: 'hub', rect: { x: 300, y: 0, w: 100, h: 100 } } as SceneNode],
  edges: [branchEdge('a'), branchEdge('b')],
  bundles: [bundle as never],
} as unknown as MapScene;

describe('hitTest with bundles', () => {
  it('hits the bundle on its trunk', () => {
    expect(hitTest(scene, { x: 280, y: 52 }, 1)).toEqual({ kind: 'bundle', id: 'in:hub:left' });
  });

  it('hits the individual edge near the source end of its branch', () => {
    expect(hitTest(scene, { x: 110, y: 51 }, 1)).toEqual({ kind: 'edge', from: 'a', to: 'hub' });
    expect(hitTest(scene, { x: 100, y: 298 }, 1)).toEqual({ kind: 'edge', from: 'b', to: 'hub' });
  });

  it('prefers the trunk where the branches meet it', () => {
    expect(hitTest(scene, { x: 262, y: 50 }, 1)).toEqual({ kind: 'bundle', id: 'in:hub:left' });
  });

  it('keeps the reach of 6 screen pixels: farther from the trunk is the node, or nothing', () => {
    expect(hitTest(scene, { x: 280, y: 70 }, 1)).toBeNull();
    expect(hitTest(scene, { x: 280, y: 53 }, 4)).toBeNull();
    expect(hitTest(scene, { x: 280, y: 53 }, 0.5)).toEqual({ kind: 'bundle', id: 'in:hub:left' });
  });
});
