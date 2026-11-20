import { describe, expect, it } from 'vitest';

import { headRef } from './repo.logic';

describe('headRef with a side missing', () => {
  it('does not throw on A.. and A... (the core refuses these ranges)', () => {
    expect(() => headRef('main..')).not.toThrow();
    expect(() => headRef('main...')).not.toThrow();
  });
});
