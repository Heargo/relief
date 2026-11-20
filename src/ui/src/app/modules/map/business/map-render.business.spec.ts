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
const WIDTH = 1000;
const HEIGHT = 600;

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(WIDTH, HEIGHT);
  await business.load();
  return business;
}

function settle(): void {
  vi.advanceTimersByTime(2000);
}

describe('MapBusiness, render margin', () => {
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

  /** Pans so that the left edge of the rightmost visible node sits at `left` pixels. */
  function placeRightmost(business: MapBusiness, left: number): string {
    const nodes = business.visibleNodes();
    const rightmost = nodes.reduce((a, b) => (b.x > a.x ? b : a));
    business.pan(left - rightmost.x, 0);
    return rightmost.id;
  }

  it('draws a node just off screen, within 120 px', async () => {
    const business = await loaded();
    const id = placeRightmost(business, WIDTH + 100);
    expect(business.visibleNodes().some((n) => n.id === id)).toBe(true);
  });

  it('does not draw a node beyond 120 px off screen', async () => {
    const business = await loaded();
    const id = placeRightmost(business, WIDTH + 130);
    expect(business.visibleNodes().some((n) => n.id === id)).toBe(false);
  });

  it('draws a node just above the screen, within 120 px', async () => {
    const business = await loaded();
    const nodes = business.visibleNodes();
    const lowest = nodes.reduce((a, b) => (b.y + b.h > a.y + a.h ? b : a));
    business.pan(0, -(lowest.y + lowest.h) - 100);
    expect(business.visibleNodes().some((n) => n.id === lowest.id)).toBe(true);
    business.pan(0, -40);
    expect(business.visibleNodes().some((n) => n.id === lowest.id)).toBe(false);
  });
});

describe('MapBusiness.show', () => {
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

  it('keeps the camera and the level with keepView', async () => {
    const business = await loaded();
    business.setLevel(2);
    settle();
    business.pan(37, -21);
    const camera = business.camera();
    const level = business.level();
    expect(level).toBe(2);

    business.show(SNAPSHOT.graph, true);
    expect(business.camera()).toEqual(camera);
    expect(business.level()).toBe(level);
    expect(business.status()).toBe('ready');
  });

  it('with keepView, a level change still in flight lands on that level', async () => {
    // The range is changed while the camera flies to level 2: the reloaded diff redraws the map
    // before the flight ends, and the files must still open once it has landed.
    const business = await loaded();
    business.setLevel(2);
    settle();
    const landed = business.camera();
    const files = business.visibleNodes().filter((n) => n.kind === 'file' && n.mode === 'box');
    expect(files.length).toBeGreaterThan(0);
    business.setLevel(0);
    settle();

    business.setLevel(2);
    vi.advanceTimersByTime(100);
    business.show(SNAPSHOT.graph, true);
    settle();

    expect(business.level()).toBe(2);
    expect(business.camera()).toEqual(landed);
    const shown = business.visibleNodes().filter((n) => n.kind === 'file' && n.mode === 'box');
    expect(shown.map((n) => n.id)).toEqual(files.map((n) => n.id));
  });

  it('resets the camera and goes back to level 0 without keepView', async () => {
    const business = await loaded();
    const fitted = business.camera();
    business.setLevel(2);
    settle();
    business.pan(37, -21);

    business.show(SNAPSHOT.graph);
    expect(business.level()).toBe(0);
    expect(business.camera()).toEqual(fitted);
  });
});
