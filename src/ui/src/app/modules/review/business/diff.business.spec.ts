import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffBusiness } from './diff.business';

const DISCOUNT = 'pkg:@acme/api/billing::file:apps/api/billing/discount.ts';

function response(nodeIds: string[]): DiffResponse {
  return {
    diff: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      files: [],
      nodes: nodeIds.map((id) => ({ id, status: 'added', linesAdded: 0, linesRemoved: 0 })),
      edges: [],
    },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: [],
  };
}

const THREE_DOTS = response([DISCOUNT]);
const REVERSED = response([]);

const api = { diff: vi.fn() };

function rangeInUrl(): string | undefined {
  const router = TestBed.inject(Router);
  const value = router.parseUrl(router.url).queryParams['range'];
  return typeof value === 'string' ? value : undefined;
}

describe('DiffBusiness', () => {
  beforeEach(() => {
    api.diff.mockReset().mockImplementation(async (range: string | null) => {
      if (range === 'feat/promo-codes...main') return REVERSED;
      return THREE_DOTS;
    });
    TestBed.configureTestingModule({
      providers: [DiffBusiness, provideRouter([]), { provide: ReliefApiService, useValue: api }],
    });
  });

  it('has no diff before loading', () => {
    const business = TestBed.inject(DiffBusiness);
    expect(business.status()).toBe('loading');
    expect(business.diff()).toBeNull();
  });

  it('loads the diff of the range given by the server when the URL has none', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    expect(api.diff).toHaveBeenCalledTimes(1);
    expect(api.diff).toHaveBeenCalledWith('main...feat/promo-codes', 2000);
    expect(business.status()).toBe('ready');
    expect(business.range()).toBe('main...feat/promo-codes');
    expect(business.diff()).toEqual(THREE_DOTS);
  });

  it('loads the diff of the range of the URL rather than the server default', async () => {
    await TestBed.inject(Router).navigateByUrl('/?range=feat/promo-codes...main');
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    expect(api.diff).toHaveBeenCalledTimes(1);
    expect(api.diff).toHaveBeenCalledWith('feat/promo-codes...main', 2000);
    expect(business.range()).toBe('feat/promo-codes...main');
    expect(business.diff()).toEqual(REVERSED);
  });

  it('reloads the diff and updates ?range= when the range changes', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    await business.setRange('feat/promo-codes...main');

    expect(api.diff).toHaveBeenCalledTimes(2);
    expect(api.diff).toHaveBeenLastCalledWith('feat/promo-codes...main', 2000);
    expect(business.range()).toBe('feat/promo-codes...main');
    expect(business.diff()).toEqual(REVERSED);
    expect(rangeInUrl()).toBe('feat/promo-codes...main');
  });

  it('does not call the API again when the range is unchanged', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    await business.setRange('main...feat/promo-codes');
    expect(api.diff).toHaveBeenCalledTimes(1);
  });

  it('reports the API message and drops the diff when loading fails', async () => {
    api.diff.mockRejectedValueOnce(new Error("unknown revision 'nope'"));
    const business = TestBed.inject(DiffBusiness);
    await business.load('nope...main');
    expect(business.status()).toBe('error');
    expect(business.error()).toBe("unknown revision 'nope'");
    expect(business.diff()).toBeNull();
  });

  it('applies the diff on the map while "Relire la PR" is on, the default', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    expect(business.reviewMode()).toBe(true);
    expect(business.activeDiff()).toEqual(THREE_DOTS);
  });

  it('shows the map alone, without any diff, when "Relire la PR" is off', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    business.setReviewMode(false);
    expect(business.reviewMode()).toBe(false);
    expect(business.activeDiff()).toBeNull();
    // the loaded diff is kept: switching back does not call the API again
    business.setReviewMode(true);
    expect(business.activeDiff()).toEqual(THREE_DOTS);
    expect(api.diff).toHaveBeenCalledTimes(1);
  });

  it('hides the diff layer on demand', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    expect(business.showDiffLayer()).toBe(true);
    business.setShowDiffLayer(false);
    expect(business.showDiffLayer()).toBe(false);
    expect(business.activeDiff()).toBeNull();
    business.setShowDiffLayer(true);
    expect(business.activeDiff()).toEqual(THREE_DOTS);
  });
});
