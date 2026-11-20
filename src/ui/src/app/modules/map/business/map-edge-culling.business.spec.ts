import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { REST_DELAY_MS } from '../helpers/camera-layer.logic';
import { MapBusiness } from './map.business';

const ACME = acmeShop as unknown as SnapshotResponse;
const META: MetaResponse = {
  repo: 'big',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};

const node = (id: string, kind: string, parent: string | null) => ({
  id,
  kind,
  subkind: 'ts',
  parent,
  visibility: 'public',
  contentHash: 'h',
});

/** 24 packages of one file each, every file calling every other: 552 aggregated edges. */
function crowded(): SnapshotResponse {
  const packages = Array.from({ length: 24 }, (_, i) => `pkg:p${i}`);
  const file = (pkg: string) => `${pkg}::file:src/a.ts`;
  return {
    graph: {
      commit: '0123456789abcdef0123456789abcdef01234567',
      nodes: [
        ...packages.map((p) => node(p, 'package', null)),
        ...packages.map((p) => node(file(p), 'file', p)),
      ],
      edges: packages.flatMap((a) =>
        packages
          .filter((b) => b !== a)
          .map((b) => ({ from: file(a), to: file(b), kind: 'calls', precision: 'exact' })),
      ),
    },
    meta: { adapters: ['ts'], detector: 'workspace', warnings: [] },
  } as unknown as SnapshotResponse;
}

async function loaded(snapshot: SnapshotResponse): Promise<MapBusiness> {
  TestBed.configureTestingModule({
    providers: [
      MapBusiness,
      {
        provide: ReliefApiService,
        useValue: {
          meta: vi.fn().mockResolvedValue(META),
          snapshot: vi.fn().mockResolvedValue(snapshot),
        },
      },
    ],
  });
  const business = TestBed.inject(MapBusiness);
  business.setViewport(1000, 600);
  await business.load();
  vi.advanceTimersByTime(2000);
  return business;
}

describe('MapBusiness, edges out of the view and level of detail', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the edges of the view', async () => {
    const business = await loaded(ACME);
    expect(business.edgeLines().length).toBeGreaterThan(0);
  });

  it('draws no edge once the view is far from all of them', async () => {
    const business = await loaded(ACME);
    business.pan(-100000, 0);
    vi.advanceTimersByTime(REST_DELAY_MS + 30);
    expect(business.edgeLines()).toHaveLength(0);
    expect(business.mergedEdgeLines()).toHaveLength(0);
  });

  it('draws every edge in full under the threshold', async () => {
    const business = await loaded(ACME);
    expect(business.mergedEdgeLines()).toHaveLength(0);
  });

  it('merges the unchanged edges beyond the threshold', async () => {
    const business = await loaded(crowded());
    expect(business.edgeLines()).toHaveLength(0);
    expect(business.mergedEdgeLines()).toHaveLength(552);
  });

  it('draws the selected edge in full among the merged ones', async () => {
    const business = await loaded(crowded());
    const { from, to } = business.mergedEdgeLines()[7].edge;
    business.selectEdge(from, to);
    vi.advanceTimersByTime(REST_DELAY_MS + 30);
    expect(business.edgeLines().map((l) => [l.edge.from, l.edge.to])).toEqual([[from, to]]);
    expect(business.mergedEdgeLines()).toHaveLength(551);
  });
});
