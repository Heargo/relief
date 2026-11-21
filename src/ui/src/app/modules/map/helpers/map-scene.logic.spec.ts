import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import type { ImpactMarks } from '../../review/helpers/impact.logic';
import {
  MapBusiness,
  type CoChangeLine,
  type EdgeLine,
  type VisibleNode,
} from '../business/map.business';
import type { EdgeShape } from './edges.logic';
import { buildMapScene, type MapSceneInput } from './map-scene.logic';
import type { NodeInfo } from './node-info.logic';

// Public API of this ticket (S15): `buildMapScene(input): { nodes: SceneNode[]; edges: SceneEdge[] }`.
//  - input: `nodes` (VisibleNode[]), `edgeLines`, `mergedEdgeLines`, `coChangeLines`, `emphasis`
//    ({ nodes, edges }), `modesScale`, `info(id)`, `t(key, params)`, and the layers `impact`,
//    `reading`, `focus`, `archi`, `risk`, `loading` (same types as the MapCanvasComponent inputs);
//  - SceneNode: id, kind, mode ('open' | 'box' | 'ghost'), label, labelShown, header
//    ('header' | 'tab' | 'none'), status (DiffStatus | null without diff), intensity, oldLocation,
//    badges, counts ({ unit, value }[]), sub, impact ('hit' | 'box' | 'dim' | null), impactCount,
//    reading ({ seen, count } | null), flagged, loading, risk (number | null), faded,
//    emphasis ('sharp' | 'dim' | null), rect ({ x, y, w, h } in world units);
//  - SceneEdge: from, to, status, count, changed, selected, merged, coChange, impactPath,
//    violation ('new' | 'old' | null), emphasis (EdgeEmphasis), label ({ text, cls, visible }),
//    tooltip, labelRect ({ x, y, w, h } in world units, or null), mid ({ x, y }).
const SNAPSHOT = acmeShop as unknown as SnapshotResponse;
const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';

const SHAPE: EdgeShape = {
  d: 'M0 0 L100 100',
  arrow: 'M0 0',
  mx: 100,
  my: 50,
  covered: false,
  length: 200,
};

const INFOS: Record<string, NodeInfo> = {
  sys: { kind: 'service', subkind: 'service', label: 'apps/api', symbols: 12, files: 4 },
  mod: { kind: 'module', subkind: 'module', label: 'auth/', symbols: 5, files: 2 },
  file: { kind: 'file', subkind: 'ts', label: 'session.ts', symbols: 3, files: 0 },
};

function vnode(id: string, over: Partial<VisibleNode> = {}): VisibleNode {
  return { id, kind: 'file', mode: 'box', x: 10, y: 20, w: 100, h: 40, mark: null, ...over };
}

function line(from: string, to: string, over: Partial<EdgeLine> = {}): EdgeLine {
  return {
    edge: { from, to, count: 2, kinds: ['calls'], links: [], changed: false },
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
    tooltip: `${from} → ${to}`,
    ...over,
  };
}

function input(over: Partial<MapSceneInput> = {}): MapSceneInput {
  return {
    nodes: [],
    edgeLines: [],
    mergedEdgeLines: [],
    coChangeLines: [],
    emphasis: { nodes: new Map(), edges: new Map() },
    modesScale: 1,
    info: (id) => (id === 'sys' || id === 'mod' || id === 'file' ? INFOS[id] : undefined),
    t: (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
    impact: null,
    reading: null,
    focus: null,
    archi: null,
    risk: null,
    loading: new Set(),
    ...over,
  };
}

function nodeOf(over: Partial<MapSceneInput>, id: string) {
  const found = buildMapScene(input(over)).nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no scene node ${id}`);
  return found;
}

function edgeOf(over: Partial<MapSceneInput>, from: string, to: string) {
  const found = buildMapScene(input(over)).edges.find((e) => e.from === from && e.to === to);
  if (!found) throw new Error(`no scene edge ${from} -> ${to}`);
  return found;
}

describe('buildMapScene, nodes', () => {
  it('describes a closed file: label, counts, rect in world units', () => {
    const node = nodeOf({ nodes: [vnode('file', { kind: 'file', mode: 'box' })] }, 'file');
    expect(node).toMatchObject({
      id: 'file',
      kind: 'file',
      mode: 'box',
      label: 'session.ts',
      labelShown: true,
      header: 'none',
      status: null,
      oldLocation: false,
      badges: [],
      counts: [{ unit: 'symbols', value: 3 }],
      sub: null,
      impact: null,
      reading: null,
      flagged: false,
      loading: false,
      risk: null,
      faded: false,
      emphasis: null,
      rect: { x: 10, y: 20, w: 100, h: 40 },
    });
  });

  it('hides the label of a closed box too small to read', () => {
    const node = nodeOf({ nodes: [vnode('file', { w: 20, h: 40 })] }, 'file');
    expect(node.labelShown).toBe(false);
    expect(node.label).toBe('session.ts');
  });

  it('judges the label on the screen size, at the scale of the last rest', () => {
    const node = nodeOf({ nodes: [vnode('file', { w: 20, h: 40 })], modesScale: 2 }, 'file');
    expect(node.labelShown).toBe(true);
  });

  it('puts the title of an open container in its header when the zoom is readable', () => {
    const node = nodeOf({ nodes: [vnode('sys', { kind: 'service', mode: 'open' })] }, 'sys');
    expect(node.mode).toBe('open');
    expect(node.header).toBe('header');
    expect(node.labelShown).toBe(true);
  });

  it('puts the title of an open container on a tab when the zoom is too small for a header', () => {
    const node = nodeOf(
      { nodes: [vnode('sys', { kind: 'service', mode: 'open' })], modesScale: 0.2 },
      'sys',
    );
    expect(node.header).toBe('tab');
    expect(node.labelShown).toBe(false);
  });

  it('gives the height in pixels of the header of an open container, 0 for the others (S16)', () => {
    const open = nodeOf({ nodes: [vnode('sys', { kind: 'service', mode: 'open' })] }, 'sys');
    // A system header is 50 world units, capped at 38 px; at scale 1 that is 38.
    expect(open.headerHeight).toBe(38);
    const half = nodeOf(
      { nodes: [vnode('sys', { kind: 'service', mode: 'open' })], modesScale: 0.5 },
      'sys',
    );
    expect(half.headerHeight).toBe(25);
    const closed = nodeOf({ nodes: [vnode('file', { mode: 'box' })] }, 'file');
    expect(closed.headerHeight).toBe(0);
  });

  it('flags a shown label that is wider than its box (S16)', () => {
    const fits = nodeOf({ nodes: [vnode('file', { w: 100, h: 40 })] }, 'file');
    expect(fits.labelClipped).toBe(false);
    const tight = nodeOf(
      {
        nodes: [vnode('file', { w: 30, h: 40 })],
        info: () => ({ ...INFOS['file']!, label: 'a-very-long-file-name-that-cannot-fit.ts' }),
      },
      'file',
    );
    expect(tight.labelShown).toBe(true);
    expect(tight.labelClipped).toBe(true);
  });

  it('places the title tab of an open container on its top border, none otherwise (S16)', () => {
    const tabbed = nodeOf(
      { nodes: [vnode('sys', { kind: 'service', mode: 'open' })], modesScale: 0.2 },
      'sys',
    );
    const tab = tabbed.tabRect;
    expect(tab).toBeTruthy();
    expect(tab!.y).toBeLessThanOrEqual(tabbed.rect.y);
    expect(tab!.y + tab!.h).toBeGreaterThanOrEqual(tabbed.rect.y);
    expect(tab!.x).toBeGreaterThanOrEqual(tabbed.rect.x);
    expect(tab!.x + tab!.w).toBeLessThanOrEqual(tabbed.rect.x + tabbed.rect.w);
    const headed = nodeOf({ nodes: [vnode('sys', { kind: 'service', mode: 'open' })] }, 'sys');
    expect(headed.tabRect).toBeNull();
  });

  it('keeps a ghost without content', () => {
    const node = nodeOf({ nodes: [vnode('file', { mode: 'ghost' })] }, 'file');
    expect(node.mode).toBe('ghost');
    expect(node.counts).toEqual([]);
    expect(node.sub).toBeNull();
  });

  it('carries the diff mark: status, intensity, badges', () => {
    const node = nodeOf(
      {
        nodes: [
          vnode('file', {
            mark: {
              status: 'modified',
              intensity: 2,
              badges: ['breaking-api'],
              oldLocation: false,
            },
          }),
        ],
      },
      'file',
    );
    expect(node).toMatchObject({
      status: 'modified',
      intensity: 2,
      badges: ['breaking-api'],
      oldLocation: false,
    });
  });

  it('flags the former place of a moved node', () => {
    const node = nodeOf(
      {
        nodes: [
          vnode('file', {
            mark: { status: 'moved', intensity: 1, badges: [], oldLocation: true },
          }),
        ],
      },
      'file',
    );
    expect(node.oldLocation).toBe(true);
    expect(node.status).toBe('moved');
  });

  it('marks impact: reached = hit, holding a reached node = box with its count, the rest = dim', () => {
    const impact: ImpactMarks = {
      seed: 'file',
      reached: new Set(['file']),
      scope: new Set(['file', 'sys']),
      counts: new Map([['sys', 4]]),
      steps: new Set(),
    };
    const scene = buildMapScene(
      input({
        nodes: [
          vnode('file'),
          vnode('sys', { kind: 'service', mode: 'box' }),
          vnode('mod', { kind: 'module' }),
        ],
        impact,
      }),
    );
    const by = (id: string) => scene.nodes.find((n) => n.id === id);
    expect(by('file')?.impact).toBe('hit');
    expect(by('sys')?.impact).toBe('box');
    expect(by('sys')?.impactCount).toBe(4);
    expect(by('mod')?.impact).toBe('dim');
  });

  it('carries the reading progress of a node and of a container', () => {
    const reading = (id: string) =>
      id === 'file'
        ? { seen: true, count: null }
        : id === 'sys'
          ? { seen: false, count: { seen: 1, total: 3 } }
          : null;
    const scene = buildMapScene(
      input({ nodes: [vnode('file'), vnode('sys', { kind: 'service' }), vnode('mod')], reading }),
    );
    const by = (id: string) => scene.nodes.find((n) => n.id === id);
    expect(by('file')?.reading).toEqual({ seen: true, count: null });
    expect(by('sys')?.reading).toEqual({ seen: false, count: { seen: 1, total: 3 } });
    expect(by('mod')?.reading).toBeNull();
  });

  it('carries the archi flag, the loading state, the risk step and the focus fade', () => {
    const scene = buildMapScene(
      input({
        nodes: [vnode('file'), vnode('mod')],
        archi: new Set(['file']),
        loading: new Set(['mod']),
        risk: new Map([['file', 3]]),
        focus: new Set(['file']),
      }),
    );
    const file = scene.nodes.find((n) => n.id === 'file');
    const mod = scene.nodes.find((n) => n.id === 'mod');
    expect(file).toMatchObject({ flagged: true, loading: false, risk: 3, faded: false });
    expect(mod).toMatchObject({ flagged: false, loading: true, risk: 0, faded: true });
  });

  it('dims a node the selection dims, unless the impact keeps it', () => {
    const impact: ImpactMarks = {
      seed: 'mod',
      reached: new Set(['mod']),
      scope: new Set(['mod']),
      counts: new Map(),
      steps: new Set(),
    };
    const emphasis = {
      nodes: new Map([
        ['file', 'sharp' as const],
        ['mod', 'dim' as const],
        ['sys', 'dim' as const],
      ]),
      edges: new Map(),
    };
    const scene = buildMapScene(
      input({ nodes: [vnode('file'), vnode('mod'), vnode('sys')], emphasis, impact }),
    );
    const by = (id: string) => scene.nodes.find((n) => n.id === id);
    expect(by('file')?.emphasis).toBe('sharp');
    expect(by('sys')?.emphasis).toBe('dim');
    expect(by('mod')?.emphasis).not.toBe('dim');
  });
});

describe('buildMapScene, edges', () => {
  it('describes a plain edge', () => {
    const edge = edgeOf({ edgeLines: [line('a', 'b')] }, 'a', 'b');
    expect(edge).toMatchObject({
      from: 'a',
      to: 'b',
      status: 'unchanged',
      count: 2,
      changed: false,
      selected: false,
      merged: false,
      coChange: false,
      impactPath: false,
      violation: null,
      emphasis: 'normal',
      tooltip: 'a → b',
      mid: { x: 100, y: 50 },
    });
  });

  it('carries status, label and the selected flag', () => {
    const edge = edgeOf(
      {
        edgeLines: [line('a', 'b', { status: 'added', cls: 'add', label: 'new', selected: true })],
      },
      'a',
      'b',
    );
    expect(edge.status).toBe('added');
    expect(edge.selected).toBe(true);
    expect(edge.label).toEqual({ text: 'new', cls: 'add', visible: true });
  });

  it('hides the label of a short edge', () => {
    const edge = edgeOf(
      { edgeLines: [line('a', 'b', { label: 'new', shape: { ...SHAPE, length: 40 } })] },
      'a',
      'b',
    );
    expect(edge.label.visible).toBe(false);
    expect(edge.label.text).toBe('new');
  });

  it('places the label rect around the middle, in world units (room is 28x16 screen pixels)', () => {
    const edge = edgeOf({ edgeLines: [line('a', 'b', { label: 'new' })], modesScale: 2 }, 'a', 'b');
    expect(edge.labelRect).toEqual({ x: 93, y: 46, w: 14, h: 8 });
  });

  it('has no label rect when there is nothing to write', () => {
    const edge = edgeOf({ edgeLines: [line('a', 'b')] }, 'a', 'b');
    expect(edge.labelRect).toBeNull();
  });

  it('tells an introduced violation from an existing one', () => {
    const scene = buildMapScene(
      input({
        edgeLines: [
          line('a', 'b', { violations: { introduced: 1, existing: 2 } }),
          line('c', 'd', { violations: { introduced: 0, existing: 1 } }),
          line('e', 'f'),
        ],
      }),
    );
    const by = (from: string) => scene.edges.find((e) => e.from === from);
    expect(by('a')?.violation).toBe('new');
    expect(by('c')?.violation).toBe('old');
    expect(by('e')?.violation).toBeNull();
  });

  it('flags the edges on an impact path', () => {
    const impact: ImpactMarks = {
      seed: 'a',
      reached: new Set(['a', 'b']),
      scope: new Set(['a', 'b']),
      counts: new Map(),
      steps: new Set(['a>b']),
    };
    const scene = buildMapScene(input({ edgeLines: [line('a', 'b'), line('c', 'd')], impact }));
    expect(scene.edges.find((e) => e.from === 'a')?.impactPath).toBe(true);
    expect(scene.edges.find((e) => e.from === 'c')?.impactPath).toBe(false);
  });

  it('carries the emphasis of each edge by its key', () => {
    const emphasis = {
      nodes: new Map(),
      edges: new Map([
        ['a\0b', 'out' as const],
        ['c\0d', 'dim' as const],
      ]),
    };
    const scene = buildMapScene(
      input({ edgeLines: [line('a', 'b'), line('c', 'd'), line('e', 'f')], emphasis }),
    );
    expect(scene.edges.map((e) => e.emphasis)).toEqual(['out', 'dim', 'normal']);
  });

  it('lists the merged edges and the co-change edges, flagged as such', () => {
    const coChange: CoChangeLine = {
      edge: { from: 'x', to: 'y', count: 5, kinds: [], links: [], changed: false },
      shape: SHAPE,
    };
    const scene = buildMapScene(
      input({
        edgeLines: [line('a', 'b')],
        mergedEdgeLines: [line('c', 'd')],
        coChangeLines: [coChange],
      }),
    );
    expect(scene.edges).toHaveLength(3);
    const by = (from: string) => scene.edges.find((e) => e.from === from);
    expect(by('a')).toMatchObject({ merged: false, coChange: false });
    expect(by('c')).toMatchObject({ merged: true, coChange: false });
    expect(by('x')).toMatchObject({ merged: false, coChange: true, count: 5 });
  });
});

describe('buildMapScene on acme-shop', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    TestBed.configureTestingModule({
      providers: [
        MapBusiness,
        {
          provide: ReliefApiService,
          useValue: {
            meta: vi.fn().mockResolvedValue(META),
            snapshot: vi.fn().mockResolvedValue(SNAPSHOT),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  async function sceneOf(select?: () => void, impact: ImpactMarks | null = null) {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1000, 600);
    await business.load();
    select?.call(null);
    return buildMapScene({
      nodes: business.visibleNodes(),
      edgeLines: business.edgeLines(),
      mergedEdgeLines: business.mergedEdgeLines(),
      coChangeLines: business.coChangeLines(),
      emphasis: business.emphasis(),
      modesScale: business.modesScale(),
      info: (id) => business.info(id),
      t: (key) => key,
      impact,
      reading: null,
      focus: null,
      archi: null,
      risk: null,
      loading: new Set(),
    });
  }

  it('draws the four systems at level 0, with their labels, and none of them dimmed', async () => {
    const scene = await sceneOf();
    const systems = scene.nodes.filter((n) => n.kind === 'service' || n.kind === 'package');
    expect(systems.map((n) => n.id).sort()).toEqual(
      ['pkg:@acme/api', 'pkg:@acme/db', 'pkg:@acme/shared', 'pkg:@acme/web'].sort(),
    );
    expect(scene.nodes.every((n) => n.emphasis === null)).toBe(true);
    expect(scene.nodes.find((n) => n.id === API)?.label).toBe('apps/api');
  });

  it('draws the aggregated edge from apps/web to packages/db', async () => {
    const scene = await sceneOf();
    const edge = scene.edges.find((e) => e.from === WEB && e.to === DB);
    expect(edge).toBeDefined();
    expect(edge?.count).toBeGreaterThanOrEqual(1);
  });

  it('after selecting apps/web, it stays sharp and the unrelated systems are dimmed', async () => {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1000, 600);
    await business.load();
    business.selectNode(WEB);
    const scene = buildMapScene({
      nodes: business.visibleNodes(),
      edgeLines: business.edgeLines(),
      mergedEdgeLines: business.mergedEdgeLines(),
      coChangeLines: business.coChangeLines(),
      emphasis: business.emphasis(),
      modesScale: business.modesScale(),
      info: (id) => business.info(id),
      t: (key) => key,
      impact: null,
      reading: null,
      focus: null,
      archi: null,
      risk: null,
      loading: new Set(),
    });
    expect(scene.nodes.find((n) => n.id === WEB)?.emphasis).toBe('sharp');
    expect(scene.nodes.some((n) => n.emphasis === 'dim')).toBe(true);
    const out = scene.edges.find((e) => e.from === WEB && e.to === DB);
    expect(out?.emphasis).toBe('out');
  });

  it('with an impact on packages/db, it is a hit and the other systems are dimmed', async () => {
    const impact: ImpactMarks = {
      seed: DB,
      reached: new Set([DB, WEB]),
      scope: new Set([DB, WEB]),
      counts: new Map(),
      steps: new Set([`${WEB}>${DB}`]),
    };
    const scene = await sceneOf(undefined, impact);
    const by = (id: string) => scene.nodes.find((n) => n.id === id);
    expect(by(DB)?.impact).toBe('hit');
    expect(by(WEB)?.impact).toBe('hit');
    expect(by(API)?.impact).toBe('dim');
    expect(scene.edges.find((e) => e.from === WEB && e.to === DB)?.impactPath).toBe(true);
  });
});
