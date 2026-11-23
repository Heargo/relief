import { describe, expect, it } from 'vitest';

import type { EdgeLine } from '../business/map.business';
import type { EdgeBundle } from './edge-bundles.logic';
import type { EdgeShape } from './edges.logic';
import { buildMapScene, type MapSceneInput } from './map-scene.logic';

// U31, scene seam: `MapSceneInput.bundles` (EdgeBundle[], from `bundleEdges`) becomes
// `MapScene.bundles: SceneBundle[]`; each full edge in a bundle carries `bundle` (the bundle id),
// `hovered`, and a `mid` taken on its branch, so that a pointer at `mid` hits the branch.

const SHAPE: EdgeShape = {
  d: 'M0,0Q5,5 10,10',
  arrow: '',
  mx: 5,
  my: 5,
  covered: false,
  length: 200,
};

function line(from: string, to: string, over: Partial<EdgeLine> = {}): EdgeLine {
  return {
    edge: { from, to, count: 1, kinds: ['imports'], links: [], changed: false },
    shape: SHAPE,
    selected: false,
    status: 'unchanged',
    violations: { introduced: 0, existing: 0 },
    added: 0,
    removed: 0,
    moved: 0,
    review: false,
    cls: 'base',
    label: '',
    tooltip: '',
    ...over,
  };
}

const BUNDLE: EdgeBundle = {
  id: 'in:hub:left',
  box: 'hub',
  side: 'left',
  end: 'in',
  count: 3,
  added: 2,
  status: 'added',
  mixed: true,
  port: { x: 300, y: 50 },
  trunk: { from: { x: 260, y: 50 }, to: { x: 300, y: 50 }, d: 'M260,50Q280,50 300,50' },
  mid: { x: 280, y: 50 },
  branches: [
    { from: 'a', to: 'hub', d: 'M100,50Q180,50 260,50' },
    { from: 'b', to: 'hub', d: 'M100,150Q180,100 260,50' },
    { from: 'c', to: 'hub', d: 'M100,-50Q180,0 260,50' },
  ],
};

function input(over: Partial<MapSceneInput> = {}): MapSceneInput {
  return {
    nodes: [],
    edgeLines: [line('a', 'hub'), line('b', 'hub'), line('c', 'hub'), line('x', 'y')],
    mergedEdgeLines: [],
    coChangeLines: [],
    emphasis: { nodes: new Map(), edges: new Map() },
    modesScale: 1,
    info: () => undefined,
    t: (key) => key,
    impact: null,
    reading: null,
    focus: null,
    archi: null,
    risk: null,
    loading: new Set(),
    bundles: [BUNDLE],
    ...over,
  };
}

describe('buildMapScene, bundles', () => {
  it('exposes each bundle with its box, side, count, status and a clickable mid', () => {
    const [bundle] = buildMapScene(input()).bundles;
    expect(bundle).toMatchObject({
      id: 'in:hub:left',
      box: 'hub',
      side: 'left',
      end: 'in',
      count: 3,
      added: 2,
      status: 'added',
      mixed: true,
      selected: false,
      mid: { x: 280, y: 50 },
      trunk: { d: 'M260,50Q280,50 300,50' },
    });
    expect(bundle.edges).toEqual([
      { from: 'a', to: 'hub' },
      { from: 'b', to: 'hub' },
      { from: 'c', to: 'hub' },
    ]);
  });

  it('writes the count, and the new edges after it in review', () => {
    expect(buildMapScene(input()).bundles[0].label.text).toBe('3 +2');
    const plain = { ...BUNDLE, added: 0, status: 'unchanged' as const, mixed: false };
    expect(buildMapScene(input({ bundles: [plain] })).bundles[0].label.text).toBe('3');
  });

  it('has no bundle without the input', () => {
    expect(buildMapScene(input({ bundles: undefined })).bundles).toEqual([]);
  });

  it('marks the edges of a bundle with its id, and the others with null', () => {
    const edges = buildMapScene(input()).edges;
    expect(edges.filter((e) => e.bundle === 'in:hub:left').map((e) => e.from)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(edges.find((e) => e.from === 'x')!.bundle).toBeNull();
  });

  it('puts the mid of a bundled edge on its branch, not on its own curve', () => {
    const edges = buildMapScene(input()).edges;
    // the quadratic M100,50 Q180,50 260,50 at t = 0.5 is (180, 50)
    expect(edges.find((e) => e.from === 'a')!.mid).toEqual({ x: 180, y: 50 });
    expect(edges.find((e) => e.from === 'x')!.mid).toEqual({ x: 5, y: 5 });
  });

  it('flags the hovered edge, whole bundle or not', () => {
    const edges = buildMapScene(
      input({
        edgeLabels: {
          hovered: { from: 'b', to: 'hub' },
          selectedNode: null,
          selectedEdge: null,
          always: false,
        },
      }),
    ).edges;
    expect(edges.filter((e) => e.hovered).map((e) => e.from)).toEqual(['b']);
  });

  it('shows the label of a hovered bundled edge: it is drawn alone, whole', () => {
    const lines = [
      line('a', 'hub', { label: '+1', cls: 'add' }),
      line('b', 'hub', { label: '+1', cls: 'add' }),
      line('c', 'hub'),
    ];
    const edges = buildMapScene(
      input({
        edgeLines: lines,
        edgeLabels: {
          hovered: { from: 'b', to: 'hub' },
          selectedNode: null,
          selectedEdge: null,
          always: false,
        },
      }),
    ).edges;
    expect(edges.find((e) => e.from === 'b')!.label.visible).toBe(true);
    expect(edges.find((e) => e.from === 'a')!.label.visible).toBe(false);
  });

  it('marks the bundle selected when its id is the selected one', () => {
    const scene = buildMapScene(input({ selectedBundle: 'in:hub:left' }));
    expect(scene.bundles[0].selected).toBe(true);
  });

  it('keeps the label of a violating edge of a bundle visible at rest', () => {
    const lines = [
      line('a', 'hub', {
        violations: { introduced: 2, existing: 0 },
        label: '\u26a0 2',
        cls: 'viol',
      }),
      line('b', 'hub'),
      line('c', 'hub'),
    ];
    const edges = buildMapScene(input({ edgeLines: lines })).edges;
    expect(edges.find((e) => e.from === 'a')!.label).toMatchObject({
      text: '\u26a0 2',
      visible: true,
    });
    expect(edges.find((e) => e.from === 'a')!.bundle).toBe('in:hub:left');
  });
});
