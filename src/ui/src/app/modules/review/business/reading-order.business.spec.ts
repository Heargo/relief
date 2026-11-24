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

// R18. `setRepeated(groups)`, `groupOf(id)` (the members when `id` is a representative, else null),
// `markGroup(id)` (marks every member seen), and a file-mode list with one entry per group.
describe('ReadingOrderBusiness, repeated changes', () => {
  const dir = 'pkg:app/src/features';
  const F = (n: number) => `${dir}::file:src/features/f${n}.ts`;
  const GROUP = {
    representative: F(1),
    members: [F(1), F(2), F(3), F(4)],
    summary: [],
  };

  beforeEach(() => {
    api.readingOrder.mockReset().mockImplementation(async (level: string) => ({
      items:
        level === 'file'
          ? [1, 2, 3, 4, 5, 6].map((n) => ({
              id: F(n),
              reasons: [{ kind: 'lines', added: 1, removed: 0 }],
            }))
          : [],
    }));
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        ReadingOrderBusiness,
        {
          provide: ReliefApiService,
          useValue: { ...api, commitReading: vi.fn().mockResolvedValue({ commits: [] }) },
        },
      ],
    });
  });

  async function loaded() {
    const business = TestBed.inject(ReadingOrderBusiness);
    await business.load(A);
    business.setRepeated([GROUP]);
    return business;
  }

  it('lists a group once, by its representative', async () => {
    const business = await loaded();

    expect(business.ids()).toEqual([F(1), F(5), F(6)]);
    expect(business.progress()).toEqual({ seen: 0, total: 3 });
  });

  it('lists every file again without groups', async () => {
    const business = await loaded();
    business.setRepeated([]);

    expect(business.ids()).toHaveLength(6);
  });

  it('marks the whole group seen on request, and nothing else', async () => {
    const business = await loaded();
    business.toggle(F(1));
    expect(business.groupOf(F(1))).toEqual([F(1), F(2), F(3), F(4)]);
    expect(business.groupOf(F(2))).toBeNull();

    business.markGroup(F(1));

    for (const n of [1, 2, 3, 4]) expect(business.isSeen(F(n))).toBe(true);
    expect(business.isSeen(F(5))).toBe(false);
    expect(business.progress()).toEqual({ seen: 1, total: 3 });
  });
});

// R19. `stepByStep` (signal, off by default) and `setStepByStep(on)`; `open(id)` records the entry
// the reader just opened (the map selection feeds it); `current()` is the opened entry, else the
// first unseen one, else null (always null while the switch is off); `stepCurrent(direction)`
// moves `current` along `ids()` and returns the new one (null at the ends, `current` unchanged);
// `stepFocus(graph)` is the `stepFocus` logic of `current` (null while off); `frameIds(graph)` is
// the ids to frame, `current` and its direct neighbours (null while off). Turning it off keeps
// the opened entry.
describe('ReadingOrderBusiness, step by step', () => {
  const dir = 'pkg:app/src/features';
  const F = (n: number) => `${dir}::file:src/features/f${n}.ts`;
  const graph = {
    commit: 'abc',
    nodes: [1, 2, 3, 4].map((n) => ({ id: F(n), parent: dir })),
    edges: [
      { from: F(1), to: F(2), kind: 'imports', precision: 'exact' },
      { from: F(3), to: F(2), kind: 'imports', precision: 'exact' },
      { from: F(3), to: F(4), kind: 'imports', precision: 'exact' },
    ],
  } as unknown as Parameters<ReadingOrderBusiness['stepFocus']>[0];

  beforeEach(() => {
    api.readingOrder.mockReset().mockImplementation(async (level: string) => ({
      items:
        level === 'file'
          ? [1, 2, 3, 4].map((n) => ({
              id: F(n),
              reasons: [{ kind: 'lines', added: 1, removed: 0 }],
            }))
          : [],
    }));
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        ReadingOrderBusiness,
        {
          provide: ReliefApiService,
          useValue: { ...api, commitReading: vi.fn().mockResolvedValue({ commits: [] }) },
        },
      ],
    });
  });

  async function loaded() {
    const business = TestBed.inject(ReadingOrderBusiness);
    await business.load(A);
    return business;
  }

  it('is off by default: no current element, no focus, nothing to frame', async () => {
    const business = await loaded();
    business.open(F(2));

    expect(business.stepByStep()).toBe(false);
    expect(business.current()).toBeNull();
    expect(business.stepFocus(graph)).toBeNull();
    expect(business.frameIds(graph)).toBeNull();
  });

  it('takes the opened entry as the current element', async () => {
    const business = await loaded();
    business.setStepByStep(true);
    business.open(F(2));

    expect(business.current()).toBe(F(2));
    expect([...business.stepFocus(graph)!.nodes].sort()).toEqual([F(1), F(2), F(3), dir].sort());
    expect([...business.frameIds(graph)!].sort()).toEqual([F(1), F(2), F(3)]);
  });

  it('takes the first unseen entry when none is opened', async () => {
    const business = await loaded();
    business.toggle(F(1));
    business.setStepByStep(true);

    expect(business.current()).toBe(F(2));
  });

  it('steps to the next and the previous entry, and stops at the ends', async () => {
    const business = await loaded();
    business.setStepByStep(true);
    business.open(F(2));

    expect(business.stepCurrent(1)).toBe(F(3));
    expect(business.current()).toBe(F(3));
    expect([...business.frameIds(graph)!].sort()).toEqual([F(2), F(3), F(4)]);
    expect(business.stepCurrent(-1)).toBe(F(2));
    expect(business.stepCurrent(-1)).toBe(F(1));
    expect(business.stepCurrent(-1)).toBeNull();
    expect(business.current()).toBe(F(1));
  });

  it('turns off without forgetting the opened entry', async () => {
    const business = await loaded();
    business.setStepByStep(true);
    business.open(F(3));
    business.setStepByStep(false);

    expect(business.current()).toBeNull();
    expect(business.stepFocus(graph)).toBeNull();
    business.setStepByStep(true);
    expect(business.current()).toBe(F(3));
  });
});
