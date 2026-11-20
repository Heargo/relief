import { describe, expect, it } from 'vitest';

import { isClick } from './pointer.logic';

describe('isClick', () => {
  it('is a click when the pointer did not move', () => {
    expect(isClick({ x: 100, y: 50 }, { x: 100, y: 50 })).toBe(true);
  });

  it('tolerates a 2 px jitter', () => {
    expect(isClick({ x: 100, y: 50 }, { x: 102, y: 49 })).toBe(true);
  });

  it('is a drag when the pointer moved 10 px', () => {
    expect(isClick({ x: 100, y: 50 }, { x: 110, y: 50 })).toBe(false);
    expect(isClick({ x: 100, y: 50 }, { x: 100, y: 38 })).toBe(false);
  });
});
