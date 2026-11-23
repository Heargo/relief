import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SceneBundle, SceneEdge } from '../../helpers/map-scene.logic';
import { createEdgePainter } from './edge-painter';
import type { Palette } from './map-painter';

// U31, painter seam: a bundle is one trunk and its branches; a hovered or selected edge of the
// bundle is stroked alone, whole, after them. The context is a recorder, Path2D remembers its data.

class FakePath2D {
  constructor(public d = '') {}
  addPath(): void {}
}
beforeAll(() => {
  vi.stubGlobal('Path2D', FakePath2D);
});

const PALETTE = {
  add: '#add',
  del: '#del',
  mod: '#mod',
  accent: '#accent',
  faint: '#faint',
  muted: '#muted',
  map: '#map',
} as Palette;

const TRUNK = 'M260,50Q280,50 300,50';
const BRANCH = (n: number) => `M100,${n}Q180,${n} 260,50`;

const bundle = (over: Partial<SceneBundle> = {}): SceneBundle =>
  ({
    id: 'in:hub:left',
    box: 'hub',
    side: 'left',
    end: 'in',
    count: 3,
    added: 0,
    status: 'unchanged',
    mixed: false,
    selected: false,
    mid: { x: 280, y: 50 },
    trunk: { d: TRUNK },
    branches: [
      { from: 'a', to: 'hub', d: BRANCH(0) },
      { from: 'b', to: 'hub', d: BRANCH(100) },
      { from: 'c', to: 'hub', d: BRANCH(200) },
    ],
    label: { text: '3' },
    ...over,
  }) as SceneBundle;

const edge = (from: string, over: Partial<SceneEdge> = {}): SceneEdge =>
  ({
    from,
    to: 'hub',
    status: 'unchanged',
    count: 1,
    merged: false,
    coChange: false,
    selected: false,
    hovered: false,
    emphasis: 'normal',
    bundle: 'in:hub:left',
    label: { text: '', cls: 'base', visible: false },
    mid: { x: 180, y: 0 },
    shape: { d: `M0,0Q1,1 2,2 /${from}`, arrow: `ARROW-${from}`, covered: false },
    ...over,
  }) as SceneEdge;

interface Stroke {
  d: string;
  style: string;
  width: number;
}

function run(edges: SceneEdge[], bundles: SceneBundle[], camera = { scale: 1, tx: 0, ty: 0 }) {
  const strokes: Stroke[] = [];
  const fills: string[] = [];
  const texts: [string, number, number][] = [];
  const state = { strokeStyle: '', lineWidth: 0 };
  const ctx = {
    set strokeStyle(v: string) {
      state.strokeStyle = v;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
    },
    set fillStyle(_v: string) {},
    set globalAlpha(_v: number) {},
    stroke: (p: FakePath2D) =>
      strokes.push({ d: p.d, style: state.strokeStyle, width: state.lineWidth }),
    fill: (p: FakePath2D) => fills.push(p.d),
    fillText: (t: string, x: number, y: number) => texts.push([t, x, y]),
    strokeText: () => {},
    setLineDash: () => {},
  } as unknown as CanvasRenderingContext2D;
  const painter = createEdgePainter(ctx, PALETTE);
  painter.lines(edges, camera, false, bundles);
  painter.labels(edges, camera, bundles);
  return { strokes, fills, texts };
}

const three = () => [edge('a'), edge('b'), edge('c')];

describe('createEdgePainter bundles', () => {
  it('draws a bundle as one trunk and one branch per edge, not as individual curves', () => {
    const { strokes } = run(three(), [bundle()]);
    const ds = strokes.map((s) => s.d);
    expect(ds.filter((d) => d === TRUNK)).toHaveLength(1);
    expect(ds).toEqual(expect.arrayContaining([BRANCH(0), BRANCH(100), BRANCH(200)]));
    expect(ds.some((d) => d.startsWith('M0,0Q1,1'))).toBe(false);
    expect(ds).toHaveLength(4);
  });

  it('draws the trunk thicker than a branch', () => {
    const { strokes } = run(three(), [bundle()]);
    const trunk = strokes.find((s) => s.d === TRUNK)!;
    const branch = strokes.find((s) => s.d === BRANCH(0))!;
    expect(trunk.width).toBeGreaterThan(branch.width);
  });

  it('paints the trunk with the colour of the majority status', () => {
    const { strokes } = run(three(), [bundle({ status: 'added', added: 3 })]);
    expect(strokes.filter((s) => s.d === TRUNK).map((s) => s.style)).toEqual(['#add']);
  });

  it('edges the trunk with a second, wider stroke when the statuses are mixed', () => {
    const { strokes } = run(three(), [bundle({ status: 'added', added: 2, mixed: true })]);
    const trunks = strokes.filter((s) => s.d === TRUNK);
    expect(trunks).toHaveLength(2);
    expect(trunks[0].width).toBeGreaterThan(trunks[1].width);
    expect(trunks[0].style).not.toBe(trunks[1].style);
    expect(trunks[1].style).toBe('#add');
  });

  it('strokes a hovered edge of the bundle alone and whole, after the bundle', () => {
    const edges = [edge('a'), edge('b', { hovered: true }), edge('c')];
    const { strokes, fills } = run(edges, [bundle()]);
    const last = strokes[strokes.length - 1];
    expect(last.d).toBe('M0,0Q1,1 2,2 /b');
    expect(strokes.map((s) => s.d).indexOf(TRUNK)).toBeLessThan(strokes.length - 1);
    expect(fills).toContain('ARROW-b');
    expect(fills).not.toContain('ARROW-a');
  });

  it('strokes a selected edge of the bundle alone and whole too', () => {
    const edges = [edge('a', { selected: true }), edge('b'), edge('c')];
    const { strokes } = run(edges, [bundle()]);
    expect(strokes[strokes.length - 1].d).toBe('M0,0Q1,1 2,2 /a');
  });

  it('draws an edge that is in no bundle as before', () => {
    const { strokes } = run([edge('z', { bundle: null })], []);
    expect(strokes.map((s) => s.d)).toEqual(['M0,0Q1,1 2,2 /z']);
  });

  it('writes the count at the middle of the trunk, in screen pixels', () => {
    const { texts } = run(three(), [bundle()], { scale: 2, tx: 10, ty: 20 });
    expect(texts).toContainEqual(['3', 570, 120]);
  });

  it('adds the new edges to the count in review', () => {
    const { texts } = run(three(), [bundle({ added: 2, label: { text: '3 +2' } })]);
    expect(texts.map((t) => t[0])).toContain('3 +2');
  });
});
