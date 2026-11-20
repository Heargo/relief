import { describe, expect, it } from 'vitest';

import type { LogEntry } from '../../../core/models/contract';
import { WORKTREE_RANGE } from './diff-layer.logic';
import { formatRange, inRange, parseRange, rangeArrow, readingLine } from './range.logic';

// API expected (range.logic.ts):
//  - parseRange(range: string): { base: string; head: string; mergeBase: boolean }
//      "a...b" -> mergeBase true; "a..b" -> mergeBase false; a ref alone ("main") is that ref
//      against the working tree (head = WORKTREE_RANGE, mergeBase false); the working tree range
//      "WORKTREE" is HEAD against the working tree (base "HEAD").
//  - formatRange({ base, head, mergeBase }): string, the inverse of parseRange.
//  - inRange(log, base, head): Mark[], one mark per entry of `log` (newest first):
//      "head" the entry whose sha is `head`, "in" the entries after base up to head,
//      "base" the entry whose sha is `base`, "out" everything else.

describe('parseRange', () => {
  it('splits a three-dot range, which compares from the merge base', () => {
    expect(parseRange('main...feat/promo-codes')).toEqual({
      base: 'main',
      head: 'feat/promo-codes',
      mergeBase: true,
    });
  });

  it('splits a two-dot range, a direct diff', () => {
    expect(parseRange('v1.0..HEAD~2')).toEqual({ base: 'v1.0', head: 'HEAD~2', mergeBase: false });
  });

  it('reads a ref alone as that ref against the working tree', () => {
    expect(parseRange('main')).toEqual({
      base: 'main',
      head: WORKTREE_RANGE,
      mergeBase: false,
    });
  });

  it('reads the working tree range as HEAD against the working tree', () => {
    expect(parseRange(WORKTREE_RANGE)).toEqual({
      base: 'HEAD',
      head: WORKTREE_RANGE,
      mergeBase: false,
    });
  });

  it('keeps slashes and tildes in ref names', () => {
    expect(parseRange('origin/main...topic/a~1')).toEqual({
      base: 'origin/main',
      head: 'topic/a~1',
      mergeBase: true,
    });
  });
});

describe('formatRange', () => {
  it('joins with three dots from the merge base', () => {
    expect(formatRange({ base: 'main', head: 'feat/x', mergeBase: true })).toBe('main...feat/x');
  });

  it('joins with two dots for a direct diff', () => {
    expect(formatRange({ base: 'main', head: 'feat/x', mergeBase: false })).toBe('main..feat/x');
  });

  it('gives the working tree range for HEAD against the working tree', () => {
    expect(formatRange({ base: 'HEAD', head: WORKTREE_RANGE, mergeBase: false })).toBe(
      WORKTREE_RANGE,
    );
  });

  it('gives the bare ref for another base against the working tree', () => {
    expect(formatRange({ base: 'main', head: WORKTREE_RANGE, mergeBase: true })).toBe('main');
  });

  it('round-trips what parseRange reads', () => {
    for (const range of ['a...b', 'a..b', 'main', WORKTREE_RANGE, 'v1.0...HEAD']) {
      expect(formatRange(parseRange(range))).toBe(range);
    }
  });
});

const entry = (sha: string): LogEntry => ({
  sha,
  short: sha.slice(0, 7),
  subject: `commit ${sha}`,
  author: 'Ada',
  time: 0,
});

describe('inRange', () => {
  // newest first: e5 e4 e3 e2 e1
  const log = ['e5', 'e4', 'e3', 'e2', 'e1'].map(entry);

  it('marks the commits after base up to head, base as base and head as head', () => {
    expect(inRange(log, 'e2', 'e5')).toEqual(['head', 'in', 'in', 'base', 'out']);
  });

  it('marks what is newer than head as out', () => {
    expect(inRange(log, 'e1', 'e4')).toEqual(['out', 'head', 'in', 'in', 'base']);
  });

  it('marks nothing in range when base is head', () => {
    expect(inRange(log, 'e3', 'e3')).toEqual(['out', 'out', 'head', 'out', 'out']);
  });
});

// U23, API expected (range.logic.ts):
//  - readingLine(parts: RangeParts, baseResolved: string): { key: string; params: Record<string, string> }
//      three-dot -> key 'review.range.reading.mergeBase', params { head, base, sha: baseResolved };
//      two-dot -> 'review.range.reading.direct', params { base };
//      working tree head -> 'review.range.reading.worktree', params { base: 'HEAD', sha: baseResolved }.
//  - rangeArrow(mergeBase: boolean): '···→' (three-dot) or '→' (two-dot).
describe('readingLine', () => {
  it('names head, base and the merge base for a three-dot range', () => {
    expect(readingLine({ base: 'main', head: 'develop', mergeBase: true }, '4e1a9c2')).toEqual({
      key: 'review.range.reading.mergeBase',
      params: { head: 'develop', base: 'main', sha: '4e1a9c2' },
    });
  });

  it('says the base is compared as is for a two-dot range', () => {
    expect(readingLine({ base: 'main', head: 'develop', mergeBase: false }, '4e1a9c2')).toEqual({
      key: 'review.range.reading.direct',
      params: { base: 'main' },
    });
  });

  it('reads the working tree against HEAD with its sha', () => {
    expect(
      readingLine({ base: 'HEAD', head: WORKTREE_RANGE, mergeBase: false }, 'a7c03f1'),
    ).toEqual({
      key: 'review.range.reading.worktree',
      params: { base: 'HEAD', sha: 'a7c03f1' },
    });
  });
});

describe('rangeArrow', () => {
  it('is ···→ from the merge base and → for a direct diff', () => {
    expect(rangeArrow(true)).toBe('···→');
    expect(rangeArrow(false)).toBe('→');
  });
});
