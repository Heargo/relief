import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SceneEdge } from '../../helpers/map-scene.logic';
import { createEdgePainter } from './edge-painter';
import type { Palette } from './map-painter';

class FakePath2D {
  addPath(): void {}
}
beforeAll(() => {
  vi.stubGlobal('Path2D', FakePath2D);
});

const PALETTE = { muted: '#m', map: '#map', faint: '#f' } as Palette;

const edge = (visible: boolean): SceneEdge =>
  ({
    from: 'a',
    to: 'b',
    status: 'unchanged',
    count: 1,
    merged: false,
    coChange: false,
    emphasis: 'normal',
    label: { text: '3 +1', cls: 'base', visible },
    mid: { x: 100, y: 50 },
  }) as SceneEdge;

function labelsOf(e: SceneEdge) {
  const texts: [string, number, number][] = [];
  const ctx = {
    fillText: (t: string, x: number, y: number) => texts.push([t, x, y]),
    strokeText: () => {},
  } as unknown as CanvasRenderingContext2D;
  createEdgePainter(ctx, PALETTE).labels([e], { scale: 2, tx: 10, ty: 20 });
  return texts;
}

describe('createEdgePainter labels (S22: guards the painter output)', () => {
  it('writes no label on an edge too short on screen for it', () => {
    expect(labelsOf(edge(false))).toEqual([]);
  });

  it('writes the label of a long enough edge at its middle, in screen pixels', () => {
    expect(labelsOf(edge(true))).toEqual([['3 +1', 210, 120]]);
  });
});
