import { describe, expect, it } from 'vitest';

import {
  layerTransform,
  REST_DELAY_MS,
  shouldRecomputeModes,
  viewLeavesRenderedArea,
} from './camera-layer.logic';
import type { LaidOutNode, MapLayout } from './layout.logic';

const VIEWPORT = { width: 1000, height: 600 };

function laid(
  id: string,
  kind: LaidOutNode['kind'],
  rect: { x: number; y: number; w: number; h: number },
  children: string[] = [],
): LaidOutNode {
  return { id, kind, parent: null, children, ...rect };
}

// The system is 1000 world units wide: it opens at scale 0.47 (threshold 470 px).
const LAYOUT: MapLayout = {
  roots: ['sys'],
  bounds: { x: 0, y: 0, w: 1000, h: 300 },
  nodes: new Map([
    ['sys', laid('sys', 'service', { x: 0, y: 0, w: 1000, h: 300 }, ['f'])],
    ['f', laid('f', 'file', { x: 20, y: 40, w: 200, h: 100 })],
  ]),
};

describe('layerTransform', () => {
  it('carries the whole camera in one CSS transform', () => {
    expect(layerTransform({ scale: 2, tx: 30, ty: -10 })).toBe('translate(30px, -10px) scale(2)');
  });

  it('is the identity transform for the origin camera', () => {
    expect(layerTransform({ scale: 1, tx: 0, ty: 0 })).toBe('translate(0px, 0px) scale(1)');
  });
});

describe('shouldRecomputeModes', () => {
  const computedAt = { scale: 0.4, tx: 0, ty: 0 };

  it('rests after about 120 ms', () => {
    expect(REST_DELAY_MS).toBe(120);
  });

  it('keeps the modes during a zoom that crosses no threshold', () => {
    expect(shouldRecomputeModes(LAYOUT, computedAt, { scale: 0.45, tx: 0, ty: 0 }, 0)).toBe(false);
  });

  it('recomputes the modes at rest after a zoom', () => {
    expect(
      shouldRecomputeModes(LAYOUT, computedAt, { scale: 0.45, tx: 0, ty: 0 }, REST_DELAY_MS),
    ).toBe(true);
  });

  it('recomputes at once when a container reaches its opening threshold', () => {
    expect(shouldRecomputeModes(LAYOUT, computedAt, { scale: 0.48, tx: 0, ty: 0 }, 0)).toBe(true);
  });

  it('recomputes at once when a container drops below its opening threshold', () => {
    const open = { scale: 0.5, tx: 0, ty: 0 };
    expect(shouldRecomputeModes(LAYOUT, open, { scale: 0.46, tx: 0, ty: 0 }, 0)).toBe(true);
  });

  it('never recomputes the modes for a pan', () => {
    expect(shouldRecomputeModes(LAYOUT, computedAt, { scale: 0.4, tx: 300, ty: -80 }, 1000)).toBe(
      false,
    );
  });
});

describe('viewLeavesRenderedArea', () => {
  const rendered = { scale: 1, tx: 0, ty: 0 };

  it('stays put while the pan keeps the view inside the render margin', () => {
    expect(viewLeavesRenderedArea(rendered, { scale: 1, tx: -100, ty: 100 }, VIEWPORT, 120)).toBe(
      false,
    );
  });

  it('asks for a new culling once the pan passes the render margin', () => {
    expect(viewLeavesRenderedArea(rendered, { scale: 1, tx: -130, ty: 0 }, VIEWPORT, 120)).toBe(
      true,
    );
    expect(viewLeavesRenderedArea(rendered, { scale: 1, tx: 0, ty: 130 }, VIEWPORT, 120)).toBe(
      true,
    );
  });

  it('asks for a new culling when zooming out shows more than was rendered', () => {
    expect(viewLeavesRenderedArea(rendered, { scale: 0.5, tx: 0, ty: 0 }, VIEWPORT, 120)).toBe(
      true,
    );
  });
});
