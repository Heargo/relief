import type { LogEntry } from '../../../core/models/contract';
import { WORKTREE_RANGE } from './diff-layer.logic';

/** A range split into its two sides: `base...head` from the merge base, `base..head` direct. */
export interface RangeParts {
  base: string;
  head: string;
  mergeBase: boolean;
}

/** Where a commit of a log stands against a range. */
export type Mark = 'head' | 'in' | 'base' | 'out';

/** Splits a range string; a ref alone is that ref against the working tree. */
export function parseRange(range: string): RangeParts {
  const three = range.indexOf('...');
  if (three >= 0) {
    return { base: range.slice(0, three), head: range.slice(three + 3), mergeBase: true };
  }
  const two = range.indexOf('..');
  if (two >= 0) {
    return { base: range.slice(0, two), head: range.slice(two + 2), mergeBase: false };
  }
  return {
    base: range === WORKTREE_RANGE ? 'HEAD' : range,
    head: WORKTREE_RANGE,
    mergeBase: false,
  };
}

/** The inverse of `parseRange`. */
export function formatRange(parts: RangeParts): string {
  if (parts.head === WORKTREE_RANGE) {
    return parts.base === 'HEAD' ? WORKTREE_RANGE : parts.base;
  }
  return `${parts.base}${parts.mergeBase ? '...' : '..'}${parts.head}`;
}

/** One mark per entry of `log` (newest first): head, the commits after base up to head, base. */
export function inRange(log: readonly LogEntry[], base: string, head: string): Mark[] {
  const headIndex = log.findIndex((e) => e.sha === head);
  const baseIndex = log.findIndex((e) => e.sha === base);
  return log.map((entry, i) => {
    if (entry.sha === head) return 'head';
    if (entry.sha === base) return 'base';
    const afterHead = headIndex >= 0 && i > headIndex;
    return afterHead && (baseIndex < 0 || i < baseIndex) ? 'in' : 'out';
  });
}

/** Number of commits of the range, null when base is not in the history of head. */
export function rangeCount(log: readonly LogEntry[], base: string, head: string): number | null {
  if (base === head) return 0;
  if (!log.some((e) => e.sha === base) || !log.some((e) => e.sha === head)) return null;
  return inRange(log, base, head).filter((mark) => mark === 'head' || mark === 'in').length;
}

/** What a side shows: a full SHA is cut to 7 characters, the working tree is named by the caller. */
export function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}

/** The refs whose name contains `query`, case-insensitive. */
export function filterRefs(refs: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  return needle ? refs.filter((ref) => ref.toLowerCase().includes(needle)) : [...refs];
}

/** The index after a move in a list of `size` rows, kept inside it. */
export function moveActive(current: number, delta: 1 | -1, size: number): number {
  if (size === 0) return 0;
  return Math.min(size - 1, Math.max(0, current + delta));
}

export type RangeTab = 'branches' | 'tags' | 'commits';
export const RANGE_TABS: readonly RangeTab[] = ['branches', 'tags', 'commits'];

/** The tab after `tab`, wrapping around. */
export function nextTab(tab: RangeTab): RangeTab {
  return RANGE_TABS[(RANGE_TABS.indexOf(tab) + 1) % RANGE_TABS.length];
}

/** The quick picks of a side: `main`, `HEAD~1` and the last tag for base; working tree and HEAD for head. */
export function shortcutRefs(
  side: 'base' | 'head',
  branches: readonly string[],
  tags: readonly string[],
): string[] {
  if (side === 'head') return [WORKTREE_RANGE, 'HEAD'];
  const main = ['main', 'master'].find((name) => branches.includes(name));
  const lastTag = tags.at(-1);
  return [...(main ? [main] : []), 'HEAD~1', ...(lastTag ? [lastTag] : [])];
}
