import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { MapBusiness } from './map.business';

// Public API of this ticket (MapBusiness):
//  - hideExternal(): boolean (readonly signal, default true);
//  - setHideExternal(hide): re-lays the map out without (or with) the `external` nodes, the
//    `external-group` module and their edges; stored in localStorage `relief.hideExternal`
//    ('true' | 'false'). An unreadable storage keeps the default.
const SNAPSHOT = acmeShop as unknown as SnapshotResponse;
const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const KEY = 'relief.hideExternal';

function setup(): MapBusiness {
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
  return TestBed.inject(MapBusiness);
}

async function loaded(): Promise<MapBusiness> {
  const business = setup();
  business.setViewport(1000, 600);
  await business.load();
  return business;
}

function externalIds(business: MapBusiness): string[] {
  return business
    .visibleNodes()
    .map((n) => n.id)
    .filter((id) => id.startsWith('pkg:external'));
}

describe('MapBusiness external dependencies', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hides them by default', async () => {
    const business = await loaded();
    expect(business.hideExternal()).toBe(true);
    expect(externalIds(business)).toEqual([]);
  });

  it('shows the external group once switched off, and stores the choice', async () => {
    const business = await loaded();
    business.setHideExternal(false);
    vi.advanceTimersByTime(2000);
    expect(business.hideExternal()).toBe(false);
    expect(externalIds(business)).toContain('pkg:external');
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('reads the stored choice', async () => {
    localStorage.setItem(KEY, 'false');
    const business = await loaded();
    expect(business.hideExternal()).toBe(false);
    expect(externalIds(business)).toContain('pkg:external');
  });

  it('keeps the default when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const business = await loaded();
    expect(business.hideExternal()).toBe(true);
    expect(() => business.setHideExternal(false)).not.toThrow();
    expect(business.hideExternal()).toBe(false);
  });
});
