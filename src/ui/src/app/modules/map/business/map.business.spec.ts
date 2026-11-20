import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, Node, NodeKind, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from './map.business';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const API = 'pkg:@acme/api';
const MODULE = `${API}::mod:billing`;
const FILE = `${API}::file:billing/invoice.ts`;
const SYMBOL = `${FILE}::sym:computeTotal`;

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      node('pkg:acme', 'repo', null),
      node(API, 'service', 'pkg:acme'),
      node(MODULE, 'module', API),
      node(FILE, 'file', MODULE),
      node(SYMBOL, 'symbol', FILE),
      node(`${FILE}::sym:applyDiscount`, 'symbol', FILE),
      node('pkg:external', 'module', 'pkg:acme'),
      node('pkg:external/stripe-sdk', 'external', 'pkg:external'),
    ],
  },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 1,
    warnings: [],
  },
};

const VIEWPORT = { width: 1000, height: 600 };

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(VIEWPORT.width, VIEWPORT.height);
  await business.load();
  return business;
}

/** Lets every camera animation (<= 1 s) finish on the fake clock. */
function settle(): void {
  vi.advanceTimersByTime(1000);
}

function rectOf(business: MapBusiness, id: string) {
  return business.visibleNodes().find((n) => n.id === id);
}

describe('MapBusiness', () => {
  beforeEach(() => {
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
  });

  it('is loading, with nothing to show, until the snapshot arrives', () => {
    const business = TestBed.inject(MapBusiness);
    expect(business.status()).toBe('loading');
    expect(business.visibleNodes()).toEqual([]);
  });

  it('loads the snapshot of the displayed ref, then lays it out and fits everything at level 0', async () => {
    const api = TestBed.inject(ReliefApiService);
    const business = await loaded();
    expect(api.snapshot).toHaveBeenCalledWith('feat/promo-codes');
    expect(business.status()).toBe('ready');
    expect(business.level()).toBe(0);

    const system = rectOf(business, API);
    expect(system?.mode).toBe('box');
    expect(system?.kind).toBe('service');
    expect(rectOf(business, 'pkg:external')?.mode).toBe('box');
    // children of a closed box are ghosts, deeper nodes are not shown at all
    expect(rectOf(business, MODULE)?.mode).toBe('ghost');
    expect(rectOf(business, SYMBOL)).toBeUndefined();
  });

  it('reports an error status when the API fails', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MapBusiness,
        {
          provide: ReliefApiService,
          useValue: {
            meta: vi.fn().mockRejectedValue(new Error('boom')),
            snapshot: vi.fn(),
          },
        },
      ],
    });
    const business = TestBed.inject(MapBusiness);
    await business.load();
    expect(business.status()).toBe('error');
  });

  it('setLevel(3) animates to the symbols level: the file is open and its symbols are boxes', async () => {
    const business = await loaded();
    business.setLevel(3);
    settle();
    expect(business.level()).toBe(3);
    expect(rectOf(business, FILE)?.mode).toBe('open');
    expect(rectOf(business, SYMBOL)?.mode).toBe('box');
  });

  it('setLevel(2) shows the files (as boxes) but not their symbols', async () => {
    const business = await loaded();
    business.setLevel(2);
    settle();
    expect(business.level()).toBe(2);
    expect(rectOf(business, MODULE)?.mode).toBe('open');
    expect(rectOf(business, FILE)?.mode).toBe('box');
    expect(rectOf(business, SYMBOL)?.mode).toBe('ghost');
  });

  it('setLevel(0) goes back to the whole map', async () => {
    const business = await loaded();
    business.setLevel(3);
    settle();
    business.setLevel(0);
    settle();
    expect(business.level()).toBe(0);
    expect(rectOf(business, API)?.mode).toBe('box');
  });

  it('zoomAt zooms around the cursor: the world point under it does not move', async () => {
    const business = await loaded();
    const before = business.camera();
    const px = 700;
    const py = 200;
    const worldX = (px - before.tx) / before.scale;
    const worldY = (py - before.ty) / before.scale;

    business.zoomAt(1.2, px, py);

    const after = business.camera();
    expect(after.scale).toBeCloseTo(before.scale * 1.2, 6);
    expect((px - after.tx) / after.scale).toBeCloseTo(worldX, 6);
    expect((py - after.ty) / after.scale).toBeCloseTo(worldY, 6);
  });

  it('zoomAt is bounded: a huge zoom stops at a maximum, a tiny one at a minimum', async () => {
    const business = await loaded();
    business.zoomAt(1e6, 500, 300);
    const max = business.camera().scale;
    business.zoomAt(1e6, 500, 300);
    expect(business.camera().scale).toBe(max);
    expect(max).toBeLessThan(100);

    business.zoomAt(1e-9, 500, 300);
    const min = business.camera().scale;
    business.zoomAt(1e-9, 500, 300);
    expect(business.camera().scale).toBe(min);
    expect(min).toBeGreaterThan(0);
  });

  it('pan translates the camera by the given pixels', async () => {
    const business = await loaded();
    const before = business.camera();
    business.pan(30, -20);
    expect(business.camera()).toEqual({
      scale: before.scale,
      tx: before.tx + 30,
      ty: before.ty - 20,
    });
  });

  it('fitAll animates back to the camera of the first load', async () => {
    const business = await loaded();
    const initial = business.camera();
    business.zoomAt(1.5, 800, 100);
    business.pan(120, 80);
    business.fitAll();
    settle();
    const camera = business.camera();
    expect(camera.scale).toBeCloseTo(initial.scale, 6);
    expect(camera.tx).toBeCloseTo(initial.tx, 6);
    expect(camera.ty).toBeCloseTo(initial.ty, 6);
  });

  it('dive frames the node: bigger than before, centred and fully inside the viewport', async () => {
    const business = await loaded();
    const before = rectOf(business, API);
    if (!before) throw new Error('api not visible at level 0');

    business.dive(API);
    settle();

    const after = rectOf(business, API);
    if (!after) throw new Error('api not visible after dive');
    expect(after.w).toBeGreaterThan(before.w);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.x + after.w).toBeLessThanOrEqual(VIEWPORT.width);
    expect(after.y + after.h).toBeLessThanOrEqual(VIEWPORT.height);
    expect(after.x + after.w / 2).toBeCloseTo(VIEWPORT.width / 2, 0);
    expect(after.y + after.h / 2).toBeCloseTo(VIEWPORT.height / 2, 0);
  });

  it('does not expose nodes that are off screen', async () => {
    const business = await loaded();
    business.setLevel(3);
    settle();
    business.pan(100000, 0);
    expect(business.visibleNodes()).toEqual([]);
  });

  it('a level jump from the whole-map view anchors on the first root, not the one nearest the centre', async () => {
    const big = Array.from({ length: 6 }, (_, i) => `pkg:big::file:f${i}.ts`);
    const nodes: Node[] = [
      node('pkg:acme', 'repo', null),
      node('pkg:first', 'service', 'pkg:acme'),
      node('pkg:first::file:session.ts', 'file', 'pkg:first'),
      node('pkg:big', 'service', 'pkg:acme'),
      ...big.flatMap((id) => [
        node(id, 'file', 'pkg:big'),
        node(`${id}::sym:a`, 'symbol', id),
        node(`${id}::sym:b`, 'symbol', id),
      ]),
    ];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MapBusiness,
        {
          provide: ReliefApiService,
          useValue: {
            meta: vi.fn().mockResolvedValue(META),
            snapshot: vi
              .fn()
              .mockResolvedValue({ ...SNAPSHOT, graph: { ...SNAPSHOT.graph, nodes } }),
          },
        },
      ],
    });
    const business = await loaded();
    business.setLevel(2);
    settle();
    expect(rectOf(business, 'pkg:first::file:session.ts')).toBeDefined();
  });
});
