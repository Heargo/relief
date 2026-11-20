import { describe, expect, it } from 'vitest';

import { isReloadable } from './reload.logic';

describe('isReloadable', () => {
  it.each(['WORKTREE', 'INDEX', null, 'main'])('is true for %s', (range) => {
    expect(isReloadable(range)).toBe(true);
  });

  it.each(['main...feat/promo-codes', 'main..feat/promo-codes'])('is false for %s', (range) => {
    expect(isReloadable(range)).toBe(false);
  });
});
