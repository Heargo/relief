import { describe, expect, it } from 'vitest';

import { levelScales } from './camera.logic';
import type { LaidOutNode, MapLayout } from './layout.logic';
import { computeModes } from './visibility.logic';

const at = (scale: number) => ({ scale, tx: 0, ty: 0 });

function layoutOf(kind: 'module' | 'package', w: number): MapLayout {
  const nodes = new Map([
    ['c', { id: 'c', kind, parent: null, x: 0, y: 0, w, h: 300, children: ['k'] }],
    ['k', { id: 'k', kind: 'file', parent: 'c', x: 10, y: 50, w: 100, h: 50, children: [] }],
  ]);
  return { nodes, roots: ['c'], bounds: { x: 0, y: 0, w, h: 300 } } as unknown as MapLayout;
}

describe('computeModes opens on width alone', () => {
  it('opens a module 300 px wide on screen at 0.25 (header font 4.5 px)', () => {
    expect(computeModes(layoutOf('module', 1200), at(0.25)).get('c')).toBe('open');
  });

  it('opens a module at 0.3 whatever its header (10.8 px high)', () => {
    expect(computeModes(layoutOf('module', 1000), at(0.3)).get('c')).toBe('open');
  });

  it('keeps a module under 300 px on screen closed', () => {
    expect(computeModes(layoutOf('module', 1100), at(0.25)).get('c')).toBe('box');
  });

  it('opens a package 470 px wide on screen at 0.2', () => {
    expect(computeModes(layoutOf('package', 2350), at(0.2)).get('c')).toBe('open');
  });
});

function laid(id: string, kind: LaidOutNode['kind'], w: number, h: number): LaidOutNode {
  return { id, kind, parent: null, children: [], x: 0, y: 0, w, h };
}

describe('levelScales without a readable-header floor', () => {
  // very wide boxes: the thresholds are reached far below the old floors (0.32 / 0.44 / 0.24)
  const layout: MapLayout = {
    roots: ['sys'],
    bounds: { x: 0, y: 0, w: 10000, h: 6000 },
    nodes: new Map([
      ['sys', laid('sys', 'service', 10000, 6000)],
      ['mod', laid('mod', 'module', 4000, 3000)],
      ['file', laid('file', 'file', 2000, 1000)],
    ]),
  };

  it('puts each level at the width threshold alone', () => {
    const scales = levelScales(layout, { width: 1000, height: 600 });
    expect(scales[1]).toBeCloseTo((470 / 10000) * 1.04, 6);
    expect(scales[2]).toBeCloseTo((300 / 4000) * 1.04, 6);
    expect(scales[3]).toBeCloseTo((175 / 2000) * 1.06, 6);
  });
});
