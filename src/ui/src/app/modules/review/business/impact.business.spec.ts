import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImpactResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { ImpactBusiness } from './impact.business';

const SEED = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';
const OTHER = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:computeTotal';
const RANGE = 'main...feat/promo-codes';

const response = (node: string) => ({ reached: [{ node, depth: 1 }] }) as unknown as ImpactResponse;
const api = { impact: vi.fn() };

function deferred() {
  let resolve!: (value: ImpactResponse) => void;
  const promise = new Promise<ImpactResponse>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(): ImpactBusiness {
  TestBed.configureTestingModule({
    providers: [ImpactBusiness, { provide: ReliefApiService, useValue: api }],
  });
  return TestBed.inject(ImpactBusiness);
}

describe('ImpactBusiness', () => {
  beforeEach(() => {
    localStorage.clear();
    api.impact.mockReset().mockResolvedValue(response(OTHER));
  });

  it('follows HTTP by default', () => {
    expect(setup().followHttp()).toBe(true);
  });

  it('asks the API for the callers of the seed in the range', async () => {
    const business = setup();
    await business.load(SEED, RANGE);
    expect(api.impact).toHaveBeenCalledWith([SEED], 'callers', 8, true, RANGE);
    expect(business.impact()).toEqual(response(OTHER));
  });

  it('remembers an unchecked "via HTTP" in the localStorage', async () => {
    const business = setup();
    await business.load(SEED, RANGE);
    business.setFollowHttp(false);
    expect(business.followHttp()).toBe(false);
    expect(api.impact).toHaveBeenLastCalledWith([SEED], 'callers', 8, false, RANGE);
    TestBed.resetTestingModule();
    expect(setup().followHttp()).toBe(false);
  });

  it('reloads with the new direction', async () => {
    const business = setup();
    await business.load(SEED, RANGE);
    business.setDirection('dependencies');
    expect(api.impact).toHaveBeenLastCalledWith([SEED], 'dependencies', 8, true, RANGE);
  });

  it('clears the impact when the selection is cleared', async () => {
    const business = setup();
    await business.load(SEED, RANGE);
    await business.load(null, RANGE);
    expect(business.impact()).toBeNull();
  });

  it('ignores the answer of an outdated request', async () => {
    const slow = deferred();
    api.impact.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(response(OTHER));
    const business = setup();
    const first = business.load(SEED, RANGE);
    await business.load(OTHER, RANGE);
    slow.resolve(response(SEED));
    await first;
    expect(business.impact()).toEqual(response(OTHER));
  });

  it('does not keep the answer of a request made obsolete by a clear', async () => {
    const slow = deferred();
    api.impact.mockReturnValueOnce(slow.promise);
    const business = setup();
    const pending = business.load(SEED, RANGE);
    await business.load(null, RANGE);
    slow.resolve(response(SEED));
    await pending;
    expect(business.impact()).toBeNull();
  });
});
