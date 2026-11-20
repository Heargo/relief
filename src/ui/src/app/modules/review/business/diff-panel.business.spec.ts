import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, NodeChange } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffPanelBusiness } from './diff-panel.business';

const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const TOTAL = `${INVOICE}::sym:computeTotal`;
const RENDER = `${INVOICE}::sym:renderInvoice`;
const OLD_PRICE = 'pkg:@acme/web/utils::file:apps/web/utils/format.ts::sym:formatPrice';
const NEW_PRICE = 'pkg:@acme/shared/money::file:packages/shared/money/format.ts::sym:formatPrice';
const RANGE = 'main...feat/promo-codes';

const change = (c: Partial<NodeChange> & { id: string; status: NodeChange['status'] }) =>
  ({ linesAdded: 0, linesRemoved: 0, ...c }) as NodeChange;

const DIFF: DiffResponse = {
  diff: {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    files: [],
    nodes: [
      change({ id: TOTAL, status: 'modified', body: true }),
      change({ id: RENDER, status: 'added' }),
      change({ id: NEW_PRICE, status: 'moved', from: OLD_PRICE, body: false }),
    ],
    edges: [],
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

const api = { code: vi.fn() };

describe('DiffPanelBusiness', () => {
  beforeEach(() => {
    api.code.mockReset().mockResolvedValue('text');
    TestBed.configureTestingModule({
      providers: [
        DiffPanelBusiness,
        provideRouter([]),
        { provide: ReliefApiService, useValue: api },
      ],
    });
  });

  it('reads both sides of a modified symbol for the chosen range', async () => {
    await TestBed.inject(DiffPanelBusiness).show(TOTAL, DIFF, RANGE);
    expect(api.code).toHaveBeenCalledWith(TOTAL, 'base', RANGE);
    expect(api.code).toHaveBeenCalledWith(TOTAL, 'head', RANGE);
    expect(api.code).toHaveBeenCalledTimes(2);
  });

  it('reads only the head of an added symbol', async () => {
    await TestBed.inject(DiffPanelBusiness).show(RENDER, DIFF, RANGE);
    expect(api.code.mock.calls).toEqual([[RENDER, 'head', RANGE]]);
  });

  it('reads the base of a moved symbol with its base id', async () => {
    await TestBed.inject(DiffPanelBusiness).show(NEW_PRICE, DIFF, RANGE);
    expect(api.code).toHaveBeenCalledWith(OLD_PRICE, 'base', RANGE);
    expect(api.code).toHaveBeenCalledWith(NEW_PRICE, 'head', RANGE);
  });

  it('reads one block per changed symbol for a file', async () => {
    await TestBed.inject(DiffPanelBusiness).show(INVOICE, DIFF, RANGE);
    expect(api.code).toHaveBeenCalledWith(TOTAL, 'base', RANGE);
    expect(api.code).toHaveBeenCalledWith(TOTAL, 'head', RANGE);
    expect(api.code).toHaveBeenCalledWith(RENDER, 'head', RANGE);
    expect(api.code).not.toHaveBeenCalledWith(RENDER, 'base', RANGE);
  });

  it('passes a null range when none is chosen', async () => {
    await TestBed.inject(DiffPanelBusiness).show(RENDER, DIFF, null);
    expect(api.code).toHaveBeenCalledWith(RENDER, 'head', null);
  });
});
