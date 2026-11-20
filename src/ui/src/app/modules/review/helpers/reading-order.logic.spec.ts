import { describe, expect, it } from 'vitest';

import {
  changedSymbols,
  containerProgress,
  isSeen,
  nextUnseen,
  progress,
  step,
  toggleSeen,
  type ChangedSymbols,
} from './reading-order.logic';

const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const DISCOUNT = 'pkg:@acme/api/billing::file:apps/api/billing/discount.ts';
const SESSION = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts';
const TOTAL = `${INVOICE}::sym:computeTotal`;
const RENDER = `${INVOICE}::sym:renderInvoice`;
const APPLY = `${DISCOUNT}::sym:applyPromo`;

// Changed symbols of each changed file; a file with none is seen on its own id.
const CHANGED: ChangedSymbols = {
  [INVOICE]: [TOTAL, RENDER],
  [DISCOUNT]: [APPLY],
  [SESSION]: [],
};
const FILES = [DISCOUNT, INVOICE, SESSION];

describe('seen by symbol', () => {
  it('marking one symbol does not mark the other symbols of the file', () => {
    const seen = toggleSeen([], TOTAL, CHANGED);
    expect(isSeen(seen, TOTAL, CHANGED)).toBe(true);
    expect(isSeen(seen, RENDER, CHANGED)).toBe(false);
    expect(isSeen(seen, INVOICE, CHANGED)).toBe(false);
  });

  it('a file is seen when all its changed symbols are', () => {
    const seen = toggleSeen(toggleSeen([], TOTAL, CHANGED), RENDER, CHANGED);
    expect(isSeen(seen, INVOICE, CHANGED)).toBe(true);
  });

  it('marking a file marks its changed symbols', () => {
    const seen = toggleSeen([], INVOICE, CHANGED);
    expect(isSeen(seen, TOTAL, CHANGED)).toBe(true);
    expect(isSeen(seen, RENDER, CHANGED)).toBe(true);
    expect(isSeen(seen, DISCOUNT, CHANGED)).toBe(false);
  });

  it('toggling a seen file unmarks its symbols', () => {
    const seen = toggleSeen(toggleSeen([], INVOICE, CHANGED), INVOICE, CHANGED);
    expect(isSeen(seen, TOTAL, CHANGED)).toBe(false);
    expect(isSeen(seen, INVOICE, CHANGED)).toBe(false);
  });

  it('unmarking one symbol of a seen file makes the file unseen', () => {
    const seen = toggleSeen(toggleSeen([], INVOICE, CHANGED), TOTAL, CHANGED);
    expect(isSeen(seen, INVOICE, CHANGED)).toBe(false);
    expect(isSeen(seen, RENDER, CHANGED)).toBe(true);
  });

  it('a file without changed symbols is seen on its own id', () => {
    const seen = toggleSeen([], SESSION, CHANGED);
    expect(isSeen(seen, SESSION, CHANGED)).toBe(true);
  });

  it('does not mutate its input', () => {
    const before: string[] = [];
    toggleSeen(before, INVOICE, CHANGED);
    expect(before).toEqual([]);
  });
});

describe('progress', () => {
  it('counts the seen entries of the list', () => {
    expect(progress(FILES, [], CHANGED)).toEqual({ seen: 0, total: 3 });
    const seen = toggleSeen([], INVOICE, CHANGED);
    expect(progress(FILES, seen, CHANGED)).toEqual({ seen: 1, total: 3 });
  });

  it('in symbol mode a half-seen file counts for its seen symbols only', () => {
    const seen = toggleSeen([], TOTAL, CHANGED);
    expect(progress([TOTAL, RENDER, APPLY], seen, CHANGED)).toEqual({ seen: 1, total: 3 });
  });
});

describe('step and nextUnseen', () => {
  it('n with nothing selected goes to the first entry, p to the last', () => {
    expect(step(FILES, null, 1)).toBe(DISCOUNT);
    expect(step(FILES, null, -1)).toBe(SESSION);
  });

  it('moves by one and stops at the ends', () => {
    expect(step(FILES, DISCOUNT, 1)).toBe(INVOICE);
    expect(step(FILES, INVOICE, -1)).toBe(DISCOUNT);
    expect(step(FILES, SESSION, 1)).toBe(SESSION);
    expect(step(FILES, DISCOUNT, -1)).toBe(DISCOUNT);
  });

  it('an empty list has no step', () => {
    expect(step([], null, 1)).toBeNull();
  });

  it('nextUnseen skips the seen entries after the current one', () => {
    const seen = toggleSeen([], INVOICE, CHANGED);
    expect(nextUnseen(FILES, DISCOUNT, seen, CHANGED)).toBe(SESSION);
  });

  it('nextUnseen is null when everything after the current is seen', () => {
    const seen = toggleSeen([], SESSION, CHANGED);
    expect(nextUnseen(FILES, INVOICE, seen, CHANGED)).toBeNull();
  });
});

describe('container progress', () => {
  it('counts the seen entries under a container', () => {
    const seen = toggleSeen([], INVOICE, CHANGED);
    expect(containerProgress('pkg:@acme/api/billing', FILES, seen, CHANGED)).toEqual({
      seen: 1,
      total: 2,
    });
    expect(containerProgress('pkg:@acme/api/auth', FILES, seen, CHANGED)).toEqual({
      seen: 0,
      total: 1,
    });
  });

  it('a container with nothing to read has 0/0, and a prefix of another module is not matched', () => {
    expect(containerProgress('pkg:@acme/web', FILES, [], CHANGED)).toEqual({ seen: 0, total: 0 });
    expect(containerProgress('pkg:@acme/api/bill', FILES, [], CHANGED)).toEqual({
      seen: 0,
      total: 0,
    });
  });
});

describe('changedSymbols', () => {
  const entry = (id: string, added: number, removed = 0) => ({
    id,
    reasons: [{ kind: 'changed', added, removed }],
  });

  it('lists the symbols of a file whose lines are all inside them', () => {
    const out = changedSymbols([entry(INVOICE, 10, 2)], [entry(TOTAL, 7, 1), entry(RENDER, 3, 1)]);
    expect(out[INVOICE]).toEqual([TOTAL, RENDER]);
  });

  it('adds the file id when it changed more lines than its symbols account for', () => {
    const out = changedSymbols([entry(INVOICE, 12, 2)], [entry(TOTAL, 7, 1), entry(RENDER, 3, 1)]);
    expect(out[INVOICE]).toEqual([TOTAL, RENDER, INVOICE]);
    const seen = toggleSeen([], TOTAL, out);
    expect(isSeen(seen, INVOICE, out)).toBe(false);
  });

  it('a file without symbols maps to an empty list', () => {
    const out = changedSymbols([entry(SESSION, 4)], []);
    expect(out[SESSION]).toEqual([]);
  });

  it('a file whose only change is a new symbol does not get its own id', () => {
    const out = changedSymbols(
      [{ id: INVOICE, reasons: [{ kind: 'new' }, { kind: 'lines', added: 6, removed: 0 }] }],
      [{ id: TOTAL, reasons: [{ kind: 'new' }, { kind: 'lines', added: 6, removed: 0 }] }],
    );
    expect(out[INVOICE]).toEqual([TOTAL]);
  });
});
