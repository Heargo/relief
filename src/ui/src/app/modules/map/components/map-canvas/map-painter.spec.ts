import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SceneEdge, SceneNode } from '../../helpers/map-scene.logic';
import { createMapPainter, readPalette, type Palette } from './map-painter';

const PALETTE = {
  fg: '#f1',
  muted: '#f2',
  faint: '#f3',
  line: '#f4',
  line2: '#f5',
  node: '#f6',
  nodeOpen: '#f7',
  panel: '#f8',
  accent: '#f9',
  add: '#a1',
  mod: '#a2',
  del: '#a3',
  mov: '#a4',
  rule: '#a5',
  impact: '#a6',
  cochange: '#a7',
  ruleOld: '#a8',
  map: '#fa',
} as Palette;

interface Call {
  op: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
  lineWidth: number;
  dash: number[];
  font: unknown;
  /** The last `setTransform` before the call. */
  matrix: number[];
}

/** A 2D context that records every drawing call with the state it was made in. */
function fakeContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    font: '',
    dash: [],
  };
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: { s: Record<string, unknown>; m: number[] }[] = [];
  const record = (op: string, args: unknown[]) =>
    calls.push({
      op,
      args,
      fillStyle: state['fillStyle'],
      strokeStyle: state['strokeStyle'],
      globalAlpha: state['globalAlpha'] as number,
      lineWidth: state['lineWidth'] as number,
      dash: state['dash'] as number[],
      font: state['font'],
      matrix,
    });
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 6 });
      if (prop === 'setTransform')
        return (...m: number[]) => {
          matrix = m;
          record('setTransform', m);
        };
      if (prop === 'setLineDash')
        return (dash: number[]) => {
          state['dash'] = dash;
          record('setLineDash', [dash]);
        };
      if (prop === 'save') return () => stack.push({ s: { ...state }, m: matrix });
      if (prop === 'restore')
        return () => {
          const top = stack.pop();
          if (top) {
            Object.assign(state, top.s);
            matrix = top.m;
          }
        };
      if (prop in state) return state[prop];
      return (...args: unknown[]) => record(prop, args);
    },
    set(_t, prop: string, value) {
      state[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const of = (op: string) => calls.filter((c) => c.op === op);
  return { ctx, calls, of };
}

const node = (over: Partial<SceneNode> = {}): SceneNode => ({
  id: 'n',
  kind: 'file',
  mode: 'box',
  label: 'cart.ts',
  labelShown: true,
  header: 'none',
  status: null,
  intensity: null,
  oldLocation: false,
  badges: [],
  counts: [],
  sub: null,
  impact: null,
  impactCount: 0,
  reading: null,
  flagged: false,
  loading: false,
  risk: null,
  faded: false,
  emphasis: null,
  rect: { x: 10, y: 20, w: 100, h: 50 },
  headerHeight: 0,
  labelClipped: false,
  tabRect: null,
  ...over,
});

const VIEWPORT = { width: 800, height: 600 };
const CAMERA = { scale: 1, tx: 0, ty: 0 };

function paint(nodes: SceneNode[], camera = CAMERA, dpr = 1, edges: SceneEdge[] = []) {
  const rec = fakeContext();
  createMapPainter(rec.ctx, PALETTE).paint({ nodes, edges }, camera, VIEWPORT, dpr);
  return rec;
}

/**
 * The rounded rectangle of a box: its `roundRect` call (same rectangle `x,y,w,h`), and the first
 * `fill` / `stroke` that follow it, which carry the colors and alphas of the box.
 */
function box(r: ReturnType<typeof fakeContext>, rect: string) {
  const at = r.calls.findIndex((c) => c.op === 'roundRect' && c.args.slice(0, 4).join() === rect);
  if (at < 0) return undefined;
  const after = r.calls.slice(at + 1);
  return {
    radius: r.calls[at].args[4],
    fill: after.find((c) => c.op === 'fill'),
    stroke: after.find((c) => c.op === 'stroke'),
  };
}

describe('readPalette', () => {
  it('reads the --relief-* variables, trimmed', () => {
    const vars: Record<string, string> = {
      '--relief-fg': ' #111 ',
      '--relief-muted': '#222',
      '--relief-faint': '#333',
      '--relief-line': '#444',
      '--relief-line-2': '#555',
      '--relief-node': '#666',
      '--relief-node-open': '#777',
      '--relief-panel': '#888',
      '--relief-accent': '#999',
      '--relief-add': '#aaa',
      '--relief-mod': '#bbb',
      '--relief-del': '#ccc',
      '--relief-mov': '#ddd',
      '--relief-rule': '#eee',
      '--relief-impact': '#fff',
      '--relief-cochange': '#c0c',
      '--relief-rule-old': '#d0d',
      '--relief-map': '#0a0',
    };
    expect(readPalette({ getPropertyValue: (name: string) => vars[name] ?? '' })).toEqual({
      fg: '#111',
      muted: '#222',
      faint: '#333',
      line: '#444',
      line2: '#555',
      node: '#666',
      nodeOpen: '#777',
      panel: '#888',
      accent: '#999',
      add: '#aaa',
      mod: '#bbb',
      del: '#ccc',
      mov: '#ddd',
      rule: '#eee',
      impact: '#fff',
      cochange: '#c0c',
      ruleOld: '#d0d',
      map: '#0a0',
    });
  });
});

describe('createMapPainter', () => {
  it('draws a closed box in world units with the node color and a line-2 border', () => {
    const b = box(paint([node()]), '10,20,100,50');
    expect(b?.fill?.fillStyle).toBe('#f6');
    expect(b?.stroke?.strokeStyle).toBe('#f5');
  });

  it('rounds the corners of a box with a 6 px radius, not square ones', () => {
    const r = paint([node()]);
    expect(box(r, '10,20,100,50')?.radius).toBe(6);
    expect(r.of('fillRect').some((c) => c.args.join() === '10,20,100,50')).toBe(false);
    expect(r.of('strokeRect').some((c) => c.args.join() === '10,20,100,50')).toBe(false);
  });

  it('draws the label of a closed box in the foreground color', () => {
    const { of } = paint([node()]);
    const text = of('fillText').find((c) => c.args[0] === 'cart.ts');
    expect(text?.fillStyle).toBe('#f1');
  });

  it('does not draw a label the scene hides', () => {
    const { of } = paint([node({ labelShown: false })]);
    expect(of('fillText').find((c) => c.args[0] === 'cart.ts')).toBeUndefined();
  });

  it('draws an open container with the open color, and its title in the header', () => {
    const rec = paint([
      node({
        kind: 'module',
        mode: 'open',
        label: 'billing',
        header: 'header',
        headerHeight: 30,
        rect: { x: 0, y: 0, w: 300, h: 200 },
      }),
    ]);
    const of = rec.of;
    expect(box(rec, '0,0,300,200')?.fill?.fillStyle).toBe('#f7');
    const text = of('fillText').find((c) => c.args[0] === 'billing');
    expect(text).toBeDefined();
    // The title sits inside the header (30 px high), at the screen position of the container.
    expect(text!.args[2] as number).toBeLessThan(30);
  });

  it('draws the title of a tab in its own rectangle on the panel color', () => {
    const rec = paint([
      node({
        kind: 'module',
        mode: 'open',
        label: 'billing',
        header: 'tab',
        headerHeight: 9,
        rect: { x: 0, y: 0, w: 300, h: 200 },
        tabRect: { x: 8, y: -9, w: 60, h: 18 },
      }),
    ]);
    const tab = box(rec, '8,-9,60,18');
    expect(tab?.fill?.fillStyle).toBe('#f8');
    expect(tab?.stroke?.strokeStyle).toBe('#f5');
    expect(tab?.radius).toBe(4);
    expect(rec.of('fillText').find((c) => c.args[0] === 'billing')).toBeDefined();
  });

  it('ends a clipped label with an ellipsis and keeps a whole one as is', () => {
    const clipped = paint([
      node({
        label: 'a-very-long-label-name.ts',
        labelClipped: true,
        rect: { x: 0, y: 0, w: 60, h: 30 },
      }),
    ]);
    const text = clipped.of('fillText')[0].args[0] as string;
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThan('a-very-long-label-name.ts'.length);

    const whole = paint([node({ label: 'cart.ts', labelClipped: false })]);
    expect(whole.of('fillText').map((c) => c.args[0])).toContain('cart.ts');
  });

  it('borders an added node with the add color and a modified one with the mod color', () => {
    const added = paint([node({ status: 'added', intensity: 1 })]);
    expect(box(added, '10,20,100,50')?.stroke?.strokeStyle).toBe('#a1');
    const modified = paint([node({ status: 'modified', intensity: 1 })]);
    expect(box(modified, '10,20,100,50')?.stroke?.strokeStyle).toBe('#a2');
  });

  it('borders an impact hit with the impact color', () => {
    const { of } = paint([node({ impact: 'hit' })]);
    expect(of('stroke').some((c) => c.strokeStyle === '#a6')).toBe(true);
  });

  it('draws the count of an impact box in the impact color', () => {
    const { of } = paint([node({ impact: 'box', impactCount: 7 })]);
    const text = of('fillText').find((c) => String(c.args[0]).includes('7'));
    expect(text?.fillStyle).toBe('#a6');
  });

  it('draws an impact dim node at 0.3 alpha and a faded node at 0.2', () => {
    const dim = paint([node({ impact: 'dim' })]);
    expect(box(dim, '10,20,100,50')?.fill?.globalAlpha).toBe(0.3);
    const faded = paint([node({ faded: true })]);
    expect(box(faded, '10,20,100,50')?.fill?.globalAlpha).toBe(0.2);
  });

  it('draws a node dimmed by the selection fainter than a sharp one', () => {
    const dim = paint([node({ emphasis: 'dim' })]);
    const sharp = paint([node({ emphasis: 'sharp' })]);
    const rectAlpha = (r: ReturnType<typeof paint>) => box(r, '10,20,100,50')!.fill!.globalAlpha;
    expect(rectAlpha(sharp)).toBe(1);
    expect(rectAlpha(dim)).toBeLessThan(1);
    // Its text is dimmed as well.
    expect(dim.of('fillText')[0].globalAlpha).toBeLessThan(1);
  });

  it('does not draw a node outside the viewport', () => {
    const { of } = paint([
      node({ id: 'in' }),
      node({ id: 'out', label: 'far.ts', rect: { x: 5000, y: 20, w: 100, h: 50 } }),
    ]);
    expect(of('roundRect').some((c) => c.args[0] === 5000)).toBe(false);
    expect(of('fillText').some((c) => c.args[0] === 'far.ts')).toBe(false);
    expect(of('roundRect').some((c) => c.args[0] === 10)).toBe(true);
  });

  it('draws shapes under the camera and text in screen pixels', () => {
    const rec = paint([node()], { scale: 2, tx: 10, ty: 20 }, 2);
    const of = rec.of;
    const fill = box(rec, '10,20,100,50')?.fill;
    // world -> screen: scale 2, translation (10, 20), then the device pixel ratio 2.
    expect(fill?.matrix).toEqual([4, 0, 0, 4, 20, 40]);
    const text = of('fillText').find((c) => c.args[0] === 'cart.ts');
    expect(text?.matrix).toEqual([2, 0, 0, 2, 0, 0]);
  });
});

// ---- Edges (S18) ----------------------------------------------------------------------------

/** A Path2D that remembers what it was made of. */
class FakePath2D {
  readonly parts: string[] = [];
  constructor(d?: string | FakePath2D) {
    if (typeof d === 'string') this.parts.push(d);
  }
  addPath(other: FakePath2D): void {
    this.parts.push(...other.parts);
  }
  get d(): string {
    return this.parts.join(' ');
  }
}

beforeAll(() => {
  vi.stubGlobal('Path2D', FakePath2D);
});

const CURVE = 'M0 0 L100 100';
const ARROW = 'M100 100 L90 95 L95 90 Z';

const edge = (over: Partial<SceneEdge> = {}): SceneEdge => ({
  from: 'a',
  to: 'b',
  status: 'unchanged',
  count: 1,
  changed: false,
  selected: false,
  merged: false,
  coChange: false,
  impactPath: false,
  violation: null,
  emphasis: 'normal',
  label: { text: '', cls: 'base', visible: false },
  tooltip: '',
  labelRect: null,
  mid: { x: 100, y: 50 },
  shape: { d: CURVE, arrow: ARROW, covered: false },
  ...over,
});

const pathOf = (c: Call) => (c.args[0] as FakePath2D).d;
/** The stroke calls of a path (not of a rectangle). */
const strokes = (r: ReturnType<typeof paint>, d: string) =>
  r.of('stroke').filter((c) => c.args[0] instanceof FakePath2D && pathOf(c).includes(d));
const arrows = (r: ReturnType<typeof paint>) =>
  r.of('fill').filter((c) => c.args[0] instanceof FakePath2D && pathOf(c) === ARROW);
const paintEdges = (edges: SceneEdge[], camera = CAMERA, nodes: SceneNode[] = []) =>
  paint(nodes, camera, 1, edges);

describe('createMapPainter, full edges', () => {
  it('strokes the curve in world units and fills the arrow head', () => {
    const r = paintEdges([edge()], { scale: 2, tx: 10, ty: 20 });
    const line = strokes(r, CURVE);
    expect(line).toHaveLength(1);
    expect(line[0].matrix).toEqual([2, 0, 0, 2, 10, 20]);
    const arrow = arrows(r);
    expect(arrow).toHaveLength(1);
    expect(arrow[0].matrix).toEqual([2, 0, 0, 2, 10, 20]);
    expect(arrow[0].fillStyle).toBe(line[0].strokeStyle);
  });

  it('keeps the thickness of edgeThickness(count) in screen pixels', () => {
    // count 1: 1.3 px; count 4: 1.3 + 0.9 * 2 = 3.1 px; the line width is in world units.
    expect(strokes(paintEdges([edge({ count: 1 })]), CURVE)[0].lineWidth).toBeCloseTo(1.3, 5);
    expect(strokes(paintEdges([edge({ count: 4 })]), CURVE)[0].lineWidth).toBeCloseTo(3.1, 5);
    const zoomed = paintEdges([edge({ count: 4 })], { scale: 2, tx: 0, ty: 0 });
    expect(strokes(zoomed, CURVE)[0].lineWidth).toBeCloseTo(1.55, 5);
  });

  it('colors an unchanged edge faint, at 0.75 alpha, and its arrow at 0.85', () => {
    const r = paintEdges([edge()]);
    expect(strokes(r, CURVE)[0].strokeStyle).toBe('#f3');
    expect(strokes(r, CURVE)[0].globalAlpha).toBe(0.75);
    expect(arrows(r)[0].fillStyle).toBe('#f3');
    expect(arrows(r)[0].globalAlpha).toBe(0.85);
  });

  it('colors the edges by diff status', () => {
    const color = (status: SceneEdge['status']) =>
      strokes(paintEdges([edge({ status })]), CURVE)[0].strokeStyle;
    expect(color('added')).toBe('#a1');
    expect(color('modified')).toBe('#a2');
    expect(color('removed')).toBe('#a3');
    expect(color('moved')).toBe('#a4');
  });

  it('dashes an added edge 7 4, a removed one 3 4 and a moved one 2 5 (screen pixels)', () => {
    const dash = (status: SceneEdge['status']) =>
      strokes(paintEdges([edge({ status })]), CURVE)[0].dash;
    expect(dash('added')).toEqual([7, 4]);
    expect(dash('removed')).toEqual([3, 4]);
    expect(dash('moved')).toEqual([2, 5]);
    expect(dash('unchanged')).toEqual([]);
    const zoomed = paintEdges([edge({ status: 'added' })], { scale: 2, tx: 0, ty: 0 });
    expect(strokes(zoomed, CURVE)[0].dash).toEqual([3.5, 2]);
  });

  it('colors a new violation with the rule color (dashed) and an old one with the old rule color', () => {
    const fresh = strokes(paintEdges([edge({ violation: 'new' })]), CURVE)[0];
    expect(fresh.strokeStyle).toBe('#a5');
    expect(fresh.dash).toEqual([7, 4]);
    const old = strokes(paintEdges([edge({ violation: 'old' })]), CURVE)[0];
    expect(old.strokeStyle).toBe('#a8');
    expect(old.dash).toEqual([]);
  });

  it('colors a selected edge with the accent, fully opaque', () => {
    const line = strokes(paintEdges([edge({ selected: true, status: 'added' })]), CURVE)[0];
    expect(line.strokeStyle).toBe('#f9');
    expect(line.globalAlpha).toBe(1);
  });

  it('colors an edge of the impact path with the impact color', () => {
    const r = paintEdges([edge({ impactPath: true })]);
    expect(strokes(r, CURVE)[0].strokeStyle).toBe('#a6');
    expect(arrows(r)[0].fillStyle).toBe('#a6');
  });

  it('draws the emphasized edges: picked and out in the accent, in in the impact color', () => {
    const draw = (emphasis: SceneEdge['emphasis']) =>
      strokes(paintEdges([edge({ emphasis, count: 1 })]), CURVE)[0];
    expect(draw('out')).toMatchObject({ strokeStyle: '#f9', globalAlpha: 1 });
    expect(draw('out').lineWidth).toBeCloseTo(2.4, 5);
    expect(draw('in')).toMatchObject({ strokeStyle: '#a6', globalAlpha: 1 });
    expect(draw('in').lineWidth).toBeCloseTo(2.4, 5);
    expect(draw('picked')).toMatchObject({ strokeStyle: '#f9', globalAlpha: 1 });
    expect(draw('picked').lineWidth).toBeCloseTo(3, 5);
  });

  it('draws a dimmed edge, its arrow and its label at 0.12 alpha', () => {
    const r = paintEdges([
      edge({ emphasis: 'dim', label: { text: '3 +1', cls: 'base', visible: true } }),
    ]);
    expect(strokes(r, CURVE)[0].globalAlpha).toBeCloseTo(0.12, 5);
    expect(arrows(r)[0].globalAlpha).toBeCloseTo(0.12, 5);
    expect(r.of('fillText').find((c) => c.args[0] === '3 +1')?.globalAlpha).toBeCloseTo(0.12, 5);
  });

  it('does not draw a hidden edge, nor its arrow, nor its label', () => {
    const r = paintEdges([
      edge({ emphasis: 'hidden', label: { text: '3 +1', cls: 'base', visible: true } }),
    ]);
    expect(strokes(r, CURVE)).toHaveLength(0);
    expect(arrows(r)).toHaveLength(0);
    expect(r.of('fillText').some((c) => c.args[0] === '3 +1')).toBe(false);
  });
});

describe('createMapPainter, edge labels', () => {
  const labelled = (cls: string, over: Partial<SceneEdge> = {}) =>
    edge({ label: { text: '3 +1', cls, visible: true }, ...over });
  const text = (r: ReturnType<typeof paint>) => r.of('fillText').find((c) => c.args[0] === '3 +1');

  it('writes a visible label at the middle of the edge, in screen pixels', () => {
    const r = paintEdges([labelled('base')], { scale: 2, tx: 10, ty: 20 });
    const t = text(r)!;
    expect(t.args[1]).toBe(210);
    expect(t.args[2]).toBe(120);
    expect(t.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('does not write a label the scene says is not visible', () => {
    const r = paintEdges([edge({ label: { text: '3 +1', cls: 'base', visible: false } })]);
    expect(text(r)).toBeUndefined();
    expect(strokes(r, CURVE)).toHaveLength(1);
  });

  it('colors the label by class: base muted, add, del, viol, violOld, mov', () => {
    const color = (cls: string) => text(paintEdges([labelled(cls)]))!.fillStyle;
    expect(color('base')).toBe('#f2');
    expect(color('add')).toBe('#a1');
    expect(color('del')).toBe('#a3');
    expect(color('viol')).toBe('#a5');
    expect(color('violOld')).toBe('#a8');
    expect(color('mov')).toBe('#a4');
  });

  it('draws a halo in the map color under the text of the label, at the same place', () => {
    const r = paintEdges([labelled('base')], { scale: 2, tx: 10, ty: 20 });
    const halo = r.calls.findIndex((c) => c.op === 'strokeText' && c.args[0] === '3 +1');
    const fill = r.calls.findIndex((c) => c.op === 'fillText' && c.args[0] === '3 +1');
    expect(halo).toBeGreaterThanOrEqual(0);
    expect(fill).toBeGreaterThan(halo);
    expect(r.calls[halo].strokeStyle).toBe('#fa');
    expect(r.calls[halo].lineWidth).toBeGreaterThan(0);
    expect(r.calls[halo].args.slice(1)).toEqual(r.calls[fill].args.slice(1));
  });

  it('colors the label of an impact path edge with the impact color', () => {
    expect(text(paintEdges([labelled('base', { impactPath: true })]))!.fillStyle).toBe('#a6');
  });

  it('writes the label after the edges, and the edges after the boxes', () => {
    const r = paintEdges([labelled('base')], CAMERA, [node()]);
    const boxAt = r.calls.findIndex((c) => c.op === 'roundRect');
    const line = r.calls.findIndex((c) => c.op === 'stroke' && c.args[0] instanceof FakePath2D);
    const label = r.calls.findIndex((c) => c.op === 'fillText' && c.args[0] === '3 +1');
    expect(boxAt).toBeGreaterThanOrEqual(0);
    expect(line).toBeGreaterThan(boxAt);
    expect(label).toBeGreaterThan(line);
  });
});

describe('createMapPainter, merged edges', () => {
  const merged = (d: string) => edge({ merged: true, shape: { d, arrow: ARROW, covered: false } });

  it('strokes all the merged edges in one thin path, with no arrow and no label', () => {
    const r = paintEdges([
      merged('M0 0 L1 1'),
      edge({ ...merged('M2 2 L3 3'), label: { text: 'x2', cls: 'base', visible: true } }),
    ]);
    const all = r.of('stroke').filter((c) => c.args[0] instanceof FakePath2D);
    expect(all).toHaveLength(1);
    expect(pathOf(all[0])).toContain('M0 0 L1 1');
    expect(pathOf(all[0])).toContain('M2 2 L3 3');
    expect(all[0].strokeStyle).toBe('#f3');
    expect(all[0].lineWidth).toBe(1);
    expect(all[0].globalAlpha).toBe(0.6);
    expect(arrows(r)).toHaveLength(0);
    expect(r.of('fillText').some((c) => c.args[0] === 'x2')).toBe(false);
  });

  it('keeps the merged path one screen pixel thick at any zoom', () => {
    const r = paintEdges([merged('M0 0 L1 1')], { scale: 4, tx: 0, ty: 0 });
    expect(strokes(r, 'M0 0 L1 1')[0].lineWidth).toBeCloseTo(0.25, 5);
  });

  it('fades the merged path when something is selected', () => {
    const selected = paint([node({ emphasis: 'sharp' })], CAMERA, 1, [merged('M0 0 L1 1')]);
    expect(strokes(selected, 'M0 0 L1 1')[0].globalAlpha).toBeCloseTo(0.12, 5);
    const dimmedEdge = paintEdges([merged('M0 0 L1 1'), edge({ emphasis: 'out' })]);
    expect(strokes(dimmedEdge, 'M0 0 L1 1')[0].globalAlpha).toBeCloseTo(0.12, 5);
  });
});

describe('createMapPainter, co-change edges', () => {
  const cochange = (over: Partial<SceneEdge> = {}) =>
    edge({
      coChange: true,
      count: 4,
      shape: { d: 'M5 5 L6 6', arrow: ARROW, covered: false },
      ...over,
    });

  it('strokes a co-change edge dashed 6 4 in the co-change color, with no arrow', () => {
    const r = paintEdges([cochange()]);
    const line = strokes(r, 'M5 5 L6 6');
    expect(line).toHaveLength(1);
    expect(line[0].strokeStyle).toBe('#a7');
    expect(line[0].dash).toEqual([6, 4]);
    expect(line[0].globalAlpha).toBe(0.85);
    expect(line[0].lineWidth).toBeCloseTo(3.1, 5);
    expect(arrows(r)).toHaveLength(0);
  });

  it('does not write a label on a co-change edge', () => {
    const r = paintEdges([cochange({ label: { text: 'cc', cls: 'base', visible: true } })]);
    expect(r.of('fillText').some((c) => c.args[0] === 'cc')).toBe(false);
  });
});
