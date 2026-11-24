import { describe, expect, it } from 'vitest';

import type { EdgeBundle } from './edge-bundles.logic';
import { hitTest } from './map-hit.logic';
import type { MapScene, SceneNode } from './map-scene.logic';

// U31: a box under the pointer wins over a trunk that grazes it; the trunk wins outside the boxes.
const bundle = {
  id: 'in:hub:left',
  box: 'hub',
  side: 'left',
  end: 'in',
  count: 3,
  trunk: { d: 'M260,50Q280,50 300,50' },
  mid: { x: 280, y: 50 },
  branches: [],
} as unknown as EdgeBundle;

const scene = {
  nodes: [{ id: 'other', rect: { x: 250, y: 40, w: 60, h: 20 } } as SceneNode],
  edges: [],
  bundles: [bundle as never],
} as unknown as MapScene;

describe('hitTest, trunk and boxes', () => {
  it('picks the box that is under the pointer, not the trunk that grazes it', () => {
    expect(hitTest(scene, { x: 280, y: 50 }, 1)).toEqual({ kind: 'node', id: 'other' });
  });

  it('picks the trunk outside any box', () => {
    expect(hitTest({ ...scene, nodes: [] } as MapScene, { x: 280, y: 50 }, 1)).toEqual({
      kind: 'bundle',
      id: 'in:hub:left',
    });
  });

  it('picks the trunk inside an open container, whose inside is what one sees', () => {
    const open = { id: 'pkg', mode: 'open', rect: { x: 200, y: 0, w: 300, h: 200 } } as SceneNode;
    expect(hitTest({ ...scene, nodes: [open] } as MapScene, { x: 280, y: 50 }, 1)).toEqual({
      kind: 'bundle',
      id: 'in:hub:left',
    });
  });

  it('still picks a closed box over the trunk, inside an open container', () => {
    const open = { id: 'pkg', mode: 'open', rect: { x: 200, y: 0, w: 300, h: 200 } } as SceneNode;
    const box = { id: 'file', mode: 'box', rect: { x: 250, y: 40, w: 60, h: 20 } } as SceneNode;
    expect(hitTest({ ...scene, nodes: [open, box] } as MapScene, { x: 280, y: 50 }, 1)).toEqual({
      kind: 'node',
      id: 'file',
    });
  });
});
