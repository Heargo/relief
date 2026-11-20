import { describe, expect, it } from 'vitest';

import type { NodeKind } from '../../../core/models/contract';
import type { LaidOutNode, MapLayout } from './layout.logic';
import { computeModes, isInViewport, OPEN_THRESHOLDS } from './visibility.logic';

function laid(
  id: string,
  kind: NodeKind,
  parent: string | null,
  children: string[],
  w: number,
  h: number,
  x = 0,
  y = 0,
): LaidOutNode {
  return { id, kind, parent, children, x, y, w, h };
}

// Hand-written layout (world units): system 1000 wide > module 400 > file 200 > symbol 100.
const LAYOUT: MapLayout = {
  roots: ['sys', 'ext'],
  bounds: { x: 0, y: 0, w: 1300, h: 600 },
  nodes: new Map(
    [
      laid('sys', 'service', null, ['mod'], 1000, 600),
      laid('mod', 'module', 'sys', ['file'], 400, 300, 20, 60),
      laid('file', 'file', 'mod', ['sym'], 200, 100, 30, 100),
      laid('sym', 'symbol', 'file', [], 100, 20, 40, 140),
      laid('ext', 'external', null, [], 240, 110, 1060, 0),
    ].map((n) => [n.id, n]),
  ),
};

const at = (scale: number) => computeModes(LAYOUT, { scale, tx: 0, ty: 0 });

describe('OPEN_THRESHOLDS', () => {
  it('opens a system at 470 px, a module at 300 px and a file at 175 px', () => {
    expect(OPEN_THRESHOLDS).toEqual({ system: 470, module: 300, file: 175 });
  });
});

describe('computeModes', () => {
  it('at 0.3 the system is closed (300 px < 470): its module is a ghost, the rest hidden', () => {
    const m = at(0.3);
    expect(m.get('sys')).toBe('box');
    expect(m.get('mod')).toBe('ghost');
    expect(m.get('file')).toBe('hidden');
    expect(m.get('sym')).toBe('hidden');
  });

  it('at 0.5 the system is open (500 px) and the module closed (200 px < 300): file is a ghost', () => {
    const m = at(0.5);
    expect(m.get('sys')).toBe('open');
    expect(m.get('mod')).toBe('box');
    expect(m.get('file')).toBe('ghost');
    expect(m.get('sym')).toBe('hidden');
  });

  it('at 1 system, module (400 px) and file (200 px) are open and the symbol is a box', () => {
    const m = at(1);
    expect(m.get('sys')).toBe('open');
    expect(m.get('mod')).toBe('open');
    expect(m.get('file')).toBe('open');
    expect(m.get('sym')).toBe('box');
  });

  it('opens at exactly the threshold width, not below it', () => {
    expect(at(0.47).get('sys')).toBe('open'); // 1000 * 0.47 = 470
    expect(at(0.469).get('sys')).toBe('box');
  });

  it('always shows an external as a box', () => {
    expect(at(0.3).get('ext')).toBe('box');
    expect(at(2).get('ext')).toBe('box');
  });

  it('applies the module threshold to a top-level module (external group)', () => {
    const layout: MapLayout = {
      roots: ['grp'],
      bounds: { x: 0, y: 0, w: 400, h: 300 },
      nodes: new Map([
        ['grp', laid('grp', 'module', null, ['e'], 400, 300)],
        ['e', laid('e', 'external', 'grp', [], 240, 110, 14, 36)],
      ]),
    };
    expect(computeModes(layout, { scale: 0.75, tx: 0, ty: 0 }).get('grp')).toBe('open');
    expect(computeModes(layout, { scale: 0.74, tx: 0, ty: 0 }).get('grp')).toBe('box');
  });
});

describe('isInViewport', () => {
  const viewport = { width: 1000, height: 600 };

  it('is true for a rect that intersects the screen', () => {
    const rect = { x: 900, y: 500, w: 400, h: 300 };
    expect(isInViewport(rect, { scale: 1, tx: 0, ty: 0 }, viewport)).toBe(true);
  });

  it('is false for a rect fully off screen, with the camera translation applied', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(isInViewport(rect, { scale: 1, tx: 0, ty: 0 }, viewport)).toBe(true);
    expect(isInViewport(rect, { scale: 1, tx: -150, ty: 0 }, viewport)).toBe(false);
    expect(isInViewport(rect, { scale: 2, tx: 0, ty: 700 }, viewport)).toBe(false);
  });
});
