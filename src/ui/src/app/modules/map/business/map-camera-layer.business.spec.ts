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
}

describe('MapBusiness, the camera is one transform', () => {
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

  it('exposes the camera as the transform of the layer', async () => {
    const business = await loaded();
    business.pan(25, -10);
    const { scale, tx, ty } = business.camera();
    expect(business.layerTransform()).toBe(`translate(${tx}px, ${ty}px) scale(${scale})`);
  });

  it('places nodes in world coordinates, which a pan does not move', async () => {
    const business = await loaded();
    const before = business.visibleNodes().map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w }));
    business.pan(10, 5);
    const after = business.visibleNodes().map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w }));
    expect(after).toEqual(before);
  });

  it('reruns no node or edge computed on a small pan', async () => {
    const business = await loaded();
    readAll(business);
    runs('visibleNodes');
    runs('edgeLines');
    business.pan(30, 10);
    readAll(business);
    expect(runs('visibleNodes')).toBe(0);
    expect(runs('edgeLines')).toBe(0);
    expect(business.layerTransform()).toContain('scale(');
  });

  it('keeps the modes and edges while a zoom goes on, and refreshes them at rest', async () => {
    const business = await loaded();
    business.zoomAt(1.01, 500, 300);
    vi.advanceTimersByTime(500);
    readAll(business);
    runs('visibleNodes');
    runs('edgeLines');

    business.zoomAt(1.01, 500, 300);
    readAll(business);
    business.zoomAt(1.01, 500, 300);
    readAll(business);
    expect(runs('visibleNodes')).toBe(0);
    expect(runs('edgeLines')).toBe(0);

    vi.advanceTimersByTime(150);
    readAll(business);
    expect(runs('visibleNodes')).toBeGreaterThan(0);
  });
});
