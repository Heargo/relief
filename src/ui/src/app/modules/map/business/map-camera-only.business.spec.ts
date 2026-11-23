import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { MapBusiness } from './map.business';

const SNAPSHOT = acmeShop as unknown as SnapshotResponse;
const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(1000, 600);
  await business.load();
  vi.advanceTimersByTime(2000);
  return business;
}

/** How many times each computed ran since the last call (the `relief:*` marks of the benchmark). */
function runs(name: string): number {
  const count = performance.getEntriesByName(`relief:${name}`).length;
  performance.clearMeasures(`relief:${name}`);
  return count;
}

function readAll(business: MapBusiness): void {
  business.visibleNodes();
  business.edgeLines();
  business.coChangeLines();
  business.containerToLoad();
  business.emphasis();
}

describe('MapBusiness, only what follows the camera is recomputed', () => {
  beforeEach(() => {
    (globalThis as { __reliefPerf?: boolean }).__reliefPerf = true;
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
    });
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
    delete (globalThis as { __reliefPerf?: boolean }).__reliefPerf;
    performance.clearMeasures();
  });

  it('computes the modes once per scale, for the nodes and the boxes together', async () => {
    const business = await loaded();
    readAll(business);
    runs('modes');
    business.zoomAt(2, 500, 300);
    vi.advanceTimersByTime(500);
    readAll(business);
    expect(runs('modes')).toBe(1);
  });

  it('does not recompute the modes on a pan', async () => {
    const business = await loaded();
    readAll(business);
    expect(runs('modes')).toBeGreaterThan(0);
    business.pan(40, 20);
    vi.advanceTimersByTime(500);
    readAll(business);
    expect(runs('modes')).toBe(0);
  });

  it('lists the visible boxes once for the edges, the co-change lines and the container to load', async () => {
    const business = await loaded();
    readAll(business);
    runs('visibleBoxes');
    business.zoomAt(2, 500, 300);
    vi.advanceTimersByTime(500);
    readAll(business);
    expect(runs('visibleBoxes')).toBe(1);
  });

  it('computes the state of the edges once, and not again when only the scale changes', async () => {
    const business = await loaded();
    readAll(business);
    expect(runs('edgeStates')).toBe(1);
    business.zoomAt(1.01, 500, 300);
    vi.advanceTimersByTime(500);
    readAll(business);
    expect(runs('edgeStates')).toBe(0);
  });

  it('computes the state of the edges again when the violations change', async () => {
    const business = await loaded();
    readAll(business);
    runs('edgeStates');
    business.setViolations([]);
    readAll(business);
    expect(runs('edgeStates')).toBe(1);
  });

  it('computes the emphasis on selection and not on a pan', async () => {
    const business = await loaded();
    business.selectNode('pkg:@acme/web');
    readAll(business);
    expect(runs('emphasis')).toBeGreaterThan(0);
    business.pan(40, 20);
    readAll(business);
    business.pan(-10, 5);
    readAll(business);
    expect(runs('emphasis')).toBe(0);
    business.selectNode('pkg:@acme/api');
    readAll(business);
    expect(runs('emphasis')).toBe(1);
  });

  it('emphasises the edges of the selected node', async () => {
    const business = await loaded();
    business.selectNode('pkg:@acme/api');
    const { edges, nodes } = business.emphasis();
    expect(edges.get('pkg:@acme/api\u0000pkg:@acme/db')).toBe('out');
    expect(nodes.get('pkg:@acme/api')).toBe('sharp');
  });
});
