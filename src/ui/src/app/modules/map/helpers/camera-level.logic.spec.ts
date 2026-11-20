import { describe, expect, it } from 'vitest';

import { levelCamera } from './camera.logic';
import type { LaidOutNode, MapLayout } from './layout.logic';
import { isInViewport } from './visibility.logic';

const VIEWPORT = { width: 1000, height: 600 };
const START = { scale: 1, tx: 0, ty: 0 };

function laid(
  id: string,
  kind: LaidOutNode['kind'],
  rect: { x: number; y: number; w: number; h: number },
  children: string[] = [],
): LaidOutNode {
  return { id, kind, parent: null, children, ...rect };
}

describe('levelCamera on a small map', () => {
  it('centres the whole map, so that a loose file under the first box shows', () => {
    const layout: MapLayout = {
      roots: ['sys', 'loose'],
      bounds: { x: 0, y: 0, w: 400, h: 1100 },
      nodes: new Map([
        ['sys', laid('sys', 'service', { x: 0, y: 0, w: 400, h: 300 }, ['f'])],
        ['f', laid('f', 'file', { x: 20, y: 40, w: 200, h: 100 })],
        ['loose', laid('loose', 'file', { x: 0, y: 1000, w: 200, h: 100 })],
      ]),
    };
    const camera = levelCamera(layout, START, VIEWPORT, 0.5, true);
    expect(camera.scale).toBeLessThan(0.5);
    expect(isInViewport(layout.nodes.get('loose')!, camera, VIEWPORT)).toBe(true);
    expect(isInViewport(layout.nodes.get('sys')!, camera, VIEWPORT)).toBe(true);
  });

  it('does not shrink below the scale that keeps an open container open', () => {
    const layout: MapLayout = {
      roots: ['sys', 'loose'],
      bounds: { x: 0, y: 0, w: 1000, h: 2000 },
      nodes: new Map([
        ['sys', laid('sys', 'service', { x: 0, y: 0, w: 1000, h: 300 }, ['f'])],
        ['f', laid('f', 'file', { x: 20, y: 40, w: 200, h: 100 })],
        ['loose', laid('loose', 'file', { x: 0, y: 1900, w: 200, h: 100 })],
      ]),
    };
    // At 0.5 the system is 500 px wide: open (470). The whole map would need 0.26: it would close.
    const camera = levelCamera(layout, START, VIEWPORT, 0.5, true);
    expect(camera.scale).toBe(0.5);
  });
});
