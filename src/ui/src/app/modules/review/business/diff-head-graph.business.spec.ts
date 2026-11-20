import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, GraphSnapshot } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffBusiness } from './diff.business';

const FULL_HEAD = 'b'.repeat(40);
const PARTIAL_HEAD = 'c'.repeat(40);
const BASE = 'a'.repeat(40);
const REFRESH = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';

function diffTo(head: string): DiffResponse {
  return {
    diff: {
      base: BASE,
      head,
      files: [],
      nodes: [{ id: REFRESH, status: 'removed', linesAdded: 0, linesRemoved: 0 }],
      edges: [],
    },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: [],
  };
}

const graphOf = (commit: string): GraphSnapshot => ({ commit, nodes: [], edges: [] });

const api = { diff: vi.fn(), snapshot: vi.fn() };

describe('DiffBusiness, head graph of the chosen range', () => {
  beforeEach(() => {
    api.diff
      .mockReset()
      .mockImplementation(async (range: string | null) =>
        diffTo(range === 'main...partial' ? PARTIAL_HEAD : FULL_HEAD),
      );
    api.snapshot
      .mockReset()
      .mockImplementation(async (ref: string) => ({ graph: graphOf(ref), meta: {} }));
    TestBed.configureTestingModule({
      providers: [DiffBusiness, provideRouter([]), { provide: ReliefApiService, useValue: api }],
    });
  });

  it('exposes the snapshot of the head of the range', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    expect(api.snapshot).toHaveBeenCalledWith(FULL_HEAD);
    expect(business.headGraph()).toEqual(graphOf(FULL_HEAD));
  });

  it('exposes the snapshot of the head of the new range after a range change', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    await business.setRange('main...partial');
    expect(api.snapshot).toHaveBeenCalledWith(PARTIAL_HEAD);
    expect(business.headGraph()).toEqual(graphOf(PARTIAL_HEAD));
  });

  it('has no head graph when the snapshot cannot be read', async () => {
    api.snapshot.mockRejectedValue(new Error('unknown ref'));
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/promo-codes');
    expect(business.status()).toBe('ready');
    expect(business.headGraph()).toBeNull();
  });
});
