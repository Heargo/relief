import { describe, expect, it } from 'vitest';

import { lineDiff } from './line-diff.logic';

describe('lineDiff', () => {
  it('marks identical text as context with both line numbers', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([
      { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'context', text: 'b', oldLine: 2, newLine: 2 },
    ]);
  });

  it('puts the removed line before the added line of a modified line', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual([
      { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'removed', text: 'b', oldLine: 2, newLine: null },
      { kind: 'added', text: 'B', oldLine: null, newLine: 2 },
      { kind: 'context', text: 'c', oldLine: 3, newLine: 3 },
    ]);
  });

  it('numbers the lines of each side independently around an insertion', () => {
    expect(lineDiff('a\nc', 'a\nb\nc')).toEqual([
      { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'added', text: 'b', oldLine: null, newLine: 2 },
      { kind: 'context', text: 'c', oldLine: 2, newLine: 3 },
    ]);
  });

  it('shows everything as added when there is no base text', () => {
    expect(lineDiff(null, 'x\ny')).toEqual([
      { kind: 'added', text: 'x', oldLine: null, newLine: 1 },
      { kind: 'added', text: 'y', oldLine: null, newLine: 2 },
    ]);
  });

  it('shows everything as removed when there is no head text', () => {
    expect(lineDiff('x', null)).toEqual([
      { kind: 'removed', text: 'x', oldLine: 1, newLine: null },
    ]);
  });

  it('ignores the final newline of a text', () => {
    expect(lineDiff('a\n', 'a\nb\n')).toEqual([
      { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'added', text: 'b', oldLine: null, newLine: 2 },
    ]);
  });

  it('starts numbering at the given line of each side', () => {
    expect(lineDiff('a\nb', 'a\nB', { oldStart: 15, newStart: 17 })).toEqual([
      { kind: 'context', text: 'a', oldLine: 15, newLine: 17 },
      { kind: 'removed', text: 'b', oldLine: 16, newLine: null },
      { kind: 'added', text: 'B', oldLine: null, newLine: 18 },
    ]);
  });
});
