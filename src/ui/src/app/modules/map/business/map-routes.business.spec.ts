import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Edge,
  MetaResponse,
  Node,
  NodeKind,
  SnapshotResponse,
} from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { computeLayouts } from '../helpers/layout-compute.logic';
import { LAYOUT_EXECUTOR, type LayoutExecutor } from './layout-executor';
import { MapBusiness } from './map.business';

// U32, business seam. At the files level, the shape of an edge line carries its `route`
// (`EdgeShape.route`: points in world units, or null for the direct curve), made from the
// corridors that arrive with the layouts (`Layouts.corridors`, from the executor): the executor
// is asked once per graph, not again when the camera moves, and the route, in world units, is
// the same at any zoom (the scene scales it).

const META: MetaResponse = {
  repo: 'star',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};

const node = (id: string, kind: NodeKind, parent: string | null): Node => ({
  id,
  kind,
  subkind: 'x',
  parent,
  visibility: 'public',
  contentHash: 'h',
  isTest: false,
});
const imports = (from: string, to: string): Edge => ({
  from,
  to,
  kind: 'imports',
  precision: 'resolved',
});

const APP = 'pkg:app';
const LIB = 'pkg:lib';
const HUB = `${LIB}::file:src/hub.ts`;
const USERS = [1, 2].map((n) => `${APP}::file:src/u${n}.ts`);

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: USERS.map((u) => imports(u, HUB)),
    nodes: [
      node('pkg:root', 'repo', null),
      node(APP, 'package', 'pkg:root'),
      node(LIB, 'package', 'pkg:root'),
      node(HUB, 'file', LIB),
      ...USERS.map((u) => node(u, 'file', APP)),
    ],
  },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 4,
    warnings: [],
  },
};

describe('MapBusiness, edge routes', () => {
  let calls: number;

  beforeEach(() => {
    calls = 0;
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const executor: LayoutExecutor = (graph) => {
      calls++;
      return Promise.resolve(computeLayouts(graph));
    };
    TestBed.configureTestingModule({
      providers: [
        MapBusiness,
        { provide: LAYOUT_EXECUTOR, useValue: executor },
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
  afterEach(() => vi.useRealTimers());

  async function files(): Promise<MapBusiness> {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1400, 900);
    await business.load();
    business.setShowUnchangedEdges(true);
    business.setLevel(2);
    vi.advanceTimersByTime(1000);
    return business;
  }

  const routes = (business: MapBusiness) =>
    business.edgeLines().map((l) => ({ key: `${l.edge.from}>${l.edge.to}`, route: l.shape.route }));

  it('gives the edges between files a route made of horizontal and vertical segments', async () => {
    const business = await files();
    const lines = routes(business).filter((l) => l.key.endsWith(`>${HUB}`));
    expect(lines.length).toBeGreaterThan(0);
    for (const { route } of lines) {
      expect(route).not.toBeNull();
      expect(route!.length).toBeGreaterThanOrEqual(2);
      route!.forEach((p, i) => {
        if (i > 0) expect(p.x === route![i - 1].x || p.y === route![i - 1].y).toBe(true);
      });
    }
  });

  it('keeps the same routes, in world units, when the camera zooms', async () => {
    const business = await files();
    const before = routes(business);
    expect(before.some((l) => l.route)).toBe(true);
    business.zoomAt(1.2, 700, 450);
    vi.advanceTimersByTime(1000);
    expect(routes(business)).toEqual(before);
  });

  it('asks the executor once, not again when the camera moves or zooms', async () => {
    const business = await files();
    const asked = calls;
    expect(asked).toBe(1);
    business.zoomAt(1.2, 700, 450);
    business.pan(30, 10);
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(asked);
  });
});
