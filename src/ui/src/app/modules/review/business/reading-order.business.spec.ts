import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReliefApiService } from '../../../core/services/relief-api.service';
import { ReadingOrderBusiness } from './reading-order.business';

const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const A = 'main...feat/promo-codes';
const B = 'main..feat/promo-codes';

const api = { readingOrder: vi.fn(), reviewState: vi.fn(), setReviewState: vi.fn() };

describe('ReadingOrderBusiness', () => {
  beforeEach(() => {
    api.readingOrder.mockReset().mockResolvedValue({
      items: [{ id: INVOICE, reasons: [{ kind: 'lines', added: 1, removed: 1 }] }],
    });
    api.reviewState.mockReset();
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [ReadingOrderBusiness, { provide: ReliefApiService, useValue: api }],
    });
  });

  it('clears the seen state of the previous range when the state of a new range fails to load', async () => {
    const business = TestBed.inject(ReadingOrderBusiness);
    api.reviewState.mockResolvedValueOnce({ seen: [INVOICE] });
    await business.load(A);
    expect(business.isSeen(INVOICE)).toBe(true);

    api.reviewState.mockRejectedValueOnce(new Error('no_data_dir'));
    await business.load(B);
    expect(business.isSeen(INVOICE)).toBe(false);
    expect(business.progress()).toEqual({ seen: 0, total: 1 });
    expect(business.persisted()).toBe(false);
  });
});
