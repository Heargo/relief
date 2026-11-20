import { describe, expect, it } from 'vitest';

import { headRef } from './repo.logic';

describe('headRef', () => {
  it.each([null, undefined, ''])('is the working tree without a range (%s)', (range) => {
    expect(headRef(range)).toBe('WORKTREE');
  });

  it('is the working tree for a single revision', () => {
    expect(headRef('main')).toBe('WORKTREE');
    expect(headRef('v1.2.0')).toBe('WORKTREE');
  });

  it('is the index for INDEX and the working tree for WORKTREE', () => {
    expect(headRef('INDEX')).toBe('INDEX');
    expect(headRef('WORKTREE')).toBe('WORKTREE');
  });

  it('is the right side of A...B and A..B', () => {
    expect(headRef('main...feat/promo-codes')).toBe('feat/promo-codes');
    expect(headRef('main..feat/promo-codes')).toBe('feat/promo-codes');
  });
});
