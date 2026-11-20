import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { MapBusiness } from './map.business';

// Public API of this ticket (MapBusiness):
//  - layoutMode(): 'fewer-crossings' | 'raw-grid' (readonly signal, default 'fewer-crossings');
//  - setLayoutMode(mode): re-lays the map out (animated); stored in localStorage `relief.layout`
//    (value = the mode string);
//  - crossingTotals(): { optimized, raw }, sums of levels 1..3 of both layouts, whatever the mode;
//  - visibleCrossings(): crossings among the edges drawn now, for the current layout.
// "raw-grid" is the nested grid with the children of each container sorted by id.
const SNAPSHOT = acmeShop as unknown as SnapshotResponse;
const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const VIEWPORT = { width: 1000, height: 600 };
const KEY = 'relief.layout';

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(VIEWPORT.width, VIEWPORT.height);
  await business.load();
  return business;
}

function settle(): void {
  vi.advanceTimersByTime(2000);
}

function positions(business: MapBusiness): Record<string, [number, number]> {
  return Object.fromEntries(business.visibleNodes().map((n) => [n.id, [n.x, n.y]]));
}

describe('MapBusiness layout mode', () => {
  beforeEach(() => {
    localStorage.clear();
    // The figures below count the edges to the external dependencies too (U13 hides them by default).
    localStorage.setItem('relief.hideExternal', 'false');
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

  it('defaults to "fewer-crossings"', async () => {
    const business = await loaded();
    expect(business.layoutMode()).toBe('fewer-crossings');
  });

  it('reports the totals of both layouts: raw is 586, optimized has at least 50% fewer', async () => {
    const business = await loaded();
    const totals = business.crossingTotals();
    expect(totals.raw).toBe(586);
    expect(totals.optimized).toBeLessThanOrEqual(293);
    // the totals do not depend on the mode
    business.setLayoutMode('raw-grid');
    settle();
    expect(business.crossingTotals()).toEqual(totals);
  });

  it('moves the nodes when the mode changes, and back when it changes again', async () => {
    const business = await loaded();
    const optimized = positions(business);
    business.setLayoutMode('raw-grid');
    settle();
    expect(business.layoutMode()).toBe('raw-grid');
    expect(positions(business)).not.toEqual(optimized);
    business.setLayoutMode('fewer-crossings');
    settle();
    expect(positions(business)).toEqual(optimized);
  });

  it('counts the crossings on screen: in "raw-grid", whole map, the center-to-center crossing between the top-level boxes', async () => {
    const business = await loaded();
    business.setLayoutMode('raw-grid');
    settle();
    expect(business.level()).toBe(0);
    expect(business.visibleCrossings()).toBe(1);
  });

  it('remembers the choice in localStorage and restores it for a new business', async () => {
    const business = await loaded();
    business.setLayoutMode('raw-grid');
    expect(localStorage.getItem(KEY)).toBe('raw-grid');

    TestBed.resetTestingModule();
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
    const reopened = await loaded();
    expect(reopened.layoutMode()).toBe('raw-grid');
  });

  it('falls back to the default when the stored value is unknown', async () => {
    localStorage.setItem(KEY, 'sugiyama');
    const business = await loaded();
    expect(business.layoutMode()).toBe('fewer-crossings');
  });
});
