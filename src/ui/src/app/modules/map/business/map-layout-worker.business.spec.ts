import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { computeLayouts } from '../helpers/layout-compute.logic';
import { LAYOUT_EXECUTOR, type LayoutExecutor } from './layout-executor';
import { MapBusiness } from './map.business';

// Public API of this ticket:
//  - LAYOUT_EXECUTOR (`./layout-executor`): Angular token of `(graph: GraphSnapshot) => Promise<Layouts>`
//    (the Web Worker in production); the business asks it for the layouts of every shown graph;
//  - until the answer arrives the map keeps the previous layout, then moves to the new one (animated);
//  - an answer for a graph that was replaced meanwhile is ignored.
const SNAPSHOT = acmeShop as unknown as SnapshotResponse;
const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

interface Pending {
  graph: Parameters<LayoutExecutor>[0];
  resolve: () => void;
}

describe('MapBusiness layout executor', () => {
  let pending: Pending[];

  beforeEach(() => {
    pending = [];
    localStorage.clear();
    localStorage.setItem('relief.hideExternal', 'false');
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const executor: LayoutExecutor = (graph) =>
      new Promise((resolve) => {
        pending.push({ graph, resolve: () => resolve(computeLayouts(graph)) });
      });
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

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  async function flush(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
  }

  function ids(business: MapBusiness): string[] {
    return business
      .visibleNodes()
      .map((n) => n.id)
      .sort();
  }

  it('asks the executor for the layouts of the loaded graph and shows nothing before the answer', async () => {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1000, 600);
    const loading = business.load();
    await flush();
    expect(pending).toHaveLength(1);
    expect(pending[0].graph.nodes).toHaveLength(132);
    expect(business.visibleNodes()).toEqual([]);
    pending[0].resolve();
    await loading;
    await flush();
    expect(business.status()).toBe('ready');
    expect(business.visibleNodes().length).toBeGreaterThan(0);
  });

  it('keeps the old layout while the new one is computed, then moves to it', async () => {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1000, 600);
    const loading = business.load();
    await flush();
    pending[0].resolve();
    await loading;
    await flush();
    const before = Object.fromEntries(business.visibleNodes().map((n) => [n.id, [n.x, n.y]]));

    business.setHideExternal(true);
    await flush();
    expect(pending).toHaveLength(2);
    expect(Object.fromEntries(business.visibleNodes().map((n) => [n.id, [n.x, n.y]]))).toEqual(
      before,
    );

    pending[1].resolve();
    await flush();
    vi.advanceTimersByTime(2000);
    expect(ids(business).some((id) => id.startsWith('pkg:external'))).toBe(false);
  });

  it('ignores an answer for a graph that was replaced meanwhile', async () => {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1000, 600);
    const loading = business.load();
    await flush();
    pending[0].resolve();
    await loading;
    await flush();

    business.setHideExternal(true);
    await flush();
    business.setHideExternal(false);
    await flush();
    expect(pending).toHaveLength(3);
    // The newest answer arrives first, the stale one after: the stale one must not win.
    pending[2].resolve();
    await flush();
    vi.advanceTimersByTime(2000);
    const settled = ids(business);
    pending[1].resolve();
    await flush();
    vi.advanceTimersByTime(2000);
    expect(ids(business)).toEqual(settled);
    expect(settled.some((id) => id.startsWith('pkg:external'))).toBe(true);
  });
});
