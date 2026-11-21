import { describe, expect, it } from 'vitest';

import type { SceneNode } from '../../helpers/map-scene.logic';
import { createMapPainter, readPalette, type Palette } from './map-painter';

const PALETTE: Palette = {
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
};

interface Call {
  op: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
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

function paint(nodes: SceneNode[], camera = CAMERA, dpr = 1) {
  const rec = fakeContext();
  createMapPainter(rec.ctx, PALETTE).paint({ nodes, edges: [] }, camera, VIEWPORT, dpr);
  return rec;
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
    });
  });
});

describe('createMapPainter', () => {
  it('draws a closed box in world units with the node color and a line-2 border', () => {
    const { of } = paint([node()]);
    const fill = of('fillRect').find((c) => c.args.join() === '10,20,100,50');
    expect(fill?.fillStyle).toBe('#f6');
    const stroke = of('strokeRect').find((c) => c.args.join() === '10,20,100,50');
    expect(stroke?.strokeStyle).toBe('#f5');
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
    const { of } = paint([
      node({
        kind: 'module',
        mode: 'open',
        label: 'billing',
        header: 'header',
        headerHeight: 30,
        rect: { x: 0, y: 0, w: 300, h: 200 },
      }),
    ]);
    const fill = of('fillRect').find((c) => c.args.join() === '0,0,300,200');
    expect(fill?.fillStyle).toBe('#f7');
    const text = of('fillText').find((c) => c.args[0] === 'billing');
    expect(text).toBeDefined();
    // The title sits inside the header (30 px high), at the screen position of the container.
    expect(text!.args[2] as number).toBeLessThan(30);
  });

  it('draws the title of a tab in its own rectangle on the panel color', () => {
    const { of } = paint([
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
    const tab = of('fillRect').find((c) => c.args.join() === '8,-9,60,18');
    expect(tab?.fillStyle).toBe('#f8');
    expect(of('strokeRect').find((c) => c.args.join() === '8,-9,60,18')?.strokeStyle).toBe('#f5');
    expect(of('fillText').find((c) => c.args[0] === 'billing')).toBeDefined();
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
    expect(added.of('strokeRect').find((c) => c.args.join() === '10,20,100,50')?.strokeStyle).toBe(
      '#a1',
    );
    const modified = paint([node({ status: 'modified', intensity: 1 })]);
    expect(
      modified.of('strokeRect').find((c) => c.args.join() === '10,20,100,50')?.strokeStyle,
    ).toBe('#a2');
  });

  it('borders an impact hit with the impact color', () => {
    const { of } = paint([node({ impact: 'hit' })]);
    expect(of('strokeRect').some((c) => c.strokeStyle === '#a6')).toBe(true);
  });

  it('draws the count of an impact box in the impact color', () => {
    const { of } = paint([node({ impact: 'box', impactCount: 7 })]);
    const text = of('fillText').find((c) => String(c.args[0]).includes('7'));
    expect(text?.fillStyle).toBe('#a6');
  });

  it('draws an impact dim node at 0.3 alpha and a faded node at 0.2', () => {
    const dim = paint([node({ impact: 'dim' })]);
    expect(dim.of('fillRect').find((c) => c.args.join() === '10,20,100,50')?.globalAlpha).toBe(0.3);
    const faded = paint([node({ faded: true })]);
    expect(faded.of('fillRect').find((c) => c.args.join() === '10,20,100,50')?.globalAlpha).toBe(
      0.2,
    );
  });

  it('draws a node dimmed by the selection fainter than a sharp one', () => {
    const dim = paint([node({ emphasis: 'dim' })]);
    const sharp = paint([node({ emphasis: 'sharp' })]);
    const rectAlpha = (r: ReturnType<typeof paint>) =>
      r.of('fillRect').find((c) => c.args.join() === '10,20,100,50')!.globalAlpha;
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
    expect(of('fillRect').some((c) => c.args[0] === 5000)).toBe(false);
    expect(of('strokeRect').some((c) => c.args[0] === 5000)).toBe(false);
    expect(of('fillText').some((c) => c.args[0] === 'far.ts')).toBe(false);
    expect(of('fillRect').some((c) => c.args[0] === 10)).toBe(true);
  });

  it('draws shapes under the camera and text in screen pixels', () => {
    const { of } = paint([node()], { scale: 2, tx: 10, ty: 20 }, 2);
    const fill = of('fillRect').find((c) => c.args.join() === '10,20,100,50');
    // world -> screen: scale 2, translation (10, 20), then the device pixel ratio 2.
    expect(fill?.matrix).toEqual([4, 0, 0, 4, 20, 40]);
    const text = of('fillText').find((c) => c.args[0] === 'cart.ts');
    expect(text?.matrix).toEqual([2, 0, 0, 2, 0, 0]);
  });
});
