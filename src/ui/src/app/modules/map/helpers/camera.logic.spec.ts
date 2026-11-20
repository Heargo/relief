import { describe, expect, it } from 'vitest';

import type { LaidOutNode, MapLayout } from './layout.logic';
import {
  cameraCenter,
  currentLevel,
  easeInOutCubic,
  fitRect,
  interpolateCamera,
  levelScales,
  panBy,
  zoomAt,
} from './camera.logic';

const VIEWPORT = { width: 1000, height: 600 };
const BOUNDS = { min: 0.1, max: 2.6 };

describe('zoomAt', () => {
  it('scales and keeps the world point under the cursor fixed', () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 2, 100, 50, BOUNDS)).toEqual({
      scale: 2,
      tx: -100,
      ty: -50,
    });
  });

  it('keeps the cursor point fixed with a non-trivial camera', () => {
    const next = zoomAt({ scale: 0.5, tx: 40, ty: -10 }, 2, 300, 200, BOUNDS);
    expect(next.scale).toBe(1);
    expect(next.tx).toBe(-220); // 300 - (300 - 40) * 2
    expect(next.ty).toBe(-220); // 200 - (200 + 10) * 2
  });

  it('clamps to the maximum and still anchors on the cursor', () => {
    const next = zoomAt({ scale: 1, tx: 0, ty: 0 }, 100, 100, 50, BOUNDS);
    expect(next.scale).toBe(2.6);
    expect(next.tx).toBeCloseTo(-160, 6);
    expect(next.ty).toBeCloseTo(-80, 6);
  });

  it('clamps to the minimum', () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0.001, 0, 0, BOUNDS).scale).toBe(0.1);
  });
});

describe('panBy', () => {
  it('translates the camera by the drag delta', () => {
    expect(panBy({ scale: 1.5, tx: 10, ty: 20 }, 30, -5)).toEqual({ scale: 1.5, tx: 40, ty: 15 });
  });
});

describe('fitRect', () => {
  it('fits and centres a rect with a padding on each side', () => {
    const cam = fitRect({ x: 0, y: 0, w: 1000, h: 600 }, VIEWPORT, { pad: 50, maxScale: 9 });
    expect(cam.scale).toBeCloseTo(500 / 600, 6); // limited by the height
    expect(cam.tx).toBeCloseTo(500 - 500 * (500 / 600), 6);
    expect(cam.ty).toBeCloseTo(50, 6);
  });

  it('never zooms past maxScale', () => {
    const cam = fitRect({ x: 100, y: 100, w: 10, h: 10 }, VIEWPORT, { pad: 50, maxScale: 1.5 });
    expect(cam.scale).toBe(1.5);
    expect(cameraCenter(cam, VIEWPORT)).toEqual({ x: 105, y: 105 });
  });
});

describe('cameraCenter', () => {
  it('returns the world point shown at the middle of the viewport', () => {
    expect(cameraCenter({ scale: 2, tx: 300, ty: 300 }, VIEWPORT)).toEqual({ x: 100, y: 0 });
  });
});

describe('interpolateCamera', () => {
  const from = { scale: 1, tx: 500, ty: 300 }; // centre (0, 0)
  const to = { scale: 4, tx: 100, ty: 300 }; // centre (100, 0)

  it('returns the endpoints at u = 0 and u = 1', () => {
    const start = interpolateCamera(from, to, 0, VIEWPORT);
    expect(start.scale).toBeCloseTo(1, 9);
    expect(start.tx).toBeCloseTo(500, 6);
    expect(start.ty).toBeCloseTo(300, 6);
    const end = interpolateCamera(from, to, 1, VIEWPORT);
    expect(end.scale).toBeCloseTo(4, 9);
    expect(end.tx).toBeCloseTo(100, 6);
    expect(end.ty).toBeCloseTo(300, 6);
  });

  it('interpolates the zoom in log space and the centre linearly', () => {
    const mid = interpolateCamera(from, to, 0.5, VIEWPORT);
    expect(mid.scale).toBeCloseTo(2, 9); // geometric mean of 1 and 4
    expect(cameraCenter(mid, VIEWPORT).x).toBeCloseTo(50, 6);
    expect(cameraCenter(mid, VIEWPORT).y).toBeCloseTo(0, 6);
  });
});

describe('easeInOutCubic', () => {
  it('is slow at the ends and passes through the middle', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 9);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375, 9);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

function laid(id: string, kind: LaidOutNode['kind'], w: number, h: number): LaidOutNode {
  return { id, kind, parent: null, children: [], x: 0, y: 0, w, h };
}

describe('levelScales and currentLevel', () => {
  // median widths: system 1000, module 400, file 200
  const layout: MapLayout = {
    roots: ['sys'],
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    nodes: new Map([
      ['sys', laid('sys', 'service', 1000, 600)],
      ['mod', laid('mod', 'module', 400, 300)],
      ['file', laid('file', 'file', 200, 100)],
    ]),
  };

  it('targets, per level, the scale at which that depth opens', () => {
    const scales = levelScales(layout, VIEWPORT);
    expect(scales).toHaveLength(4);
    expect(scales[1]).toBeCloseTo((470 / 1000) * 1.04, 6); // 0.4888
    expect(scales[2]).toBeCloseTo((300 / 400) * 1.04, 6); // 0.78
    expect(scales[3]).toBeCloseTo((175 / 200) * 1.06, 6); // 0.9275
    expect(scales[0]).toBeCloseTo(scales[1] * 0.85, 6); // fit (0.88) is larger
  });

  it('reports the deepest level whose scale is reached (3 % tolerance)', () => {
    const scales = levelScales(layout, VIEWPORT);
    expect(currentLevel(0.3, scales)).toBe(0);
    expect(currentLevel(scales[1], scales)).toBe(1);
    expect(currentLevel(scales[1] * 0.97, scales)).toBe(1);
    expect(currentLevel(0.8, scales)).toBe(2);
    expect(currentLevel(1, scales)).toBe(3);
  });
});
