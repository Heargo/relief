import { describe, expect, it } from 'vitest';

import type { Edge, GraphDiff } from '../../../core/models/contract';
import { type AggregatedEdge } from './edges.logic';
import { edgeState } from './edge-state.logic';
import { createEdgeStateCache } from './edge-state-cache.logic';

const link = (from: string, to: string): Edge => ({
  from,
  to,
  kind: 'calls',
  precision: 'resolved',
});
const aggregated = (from: string, to: string, links: Edge[], changed = false): AggregatedEdge => ({
  from,
  to,
  count: links.length,
  kinds: ['calls'],
  links,
  changed,
});

const L1 = link('pkg:a::file:f::sym:x', 'pkg:b::file:g::sym:y');
const L2 = link('pkg:a::file:f::sym:z', 'pkg:b::file:g::sym:y');
const L3 = link('pkg:a::file:f::sym:x', 'pkg:c::file:h::sym:w');

const diff = {
  base: 'a',
  head: 'b',
  files: [],
  nodes: [],
  edges: [{ ...L1, status: 'added', commit: null }],
} as unknown as GraphDiff;

const context = {
  diff,
  violations: [],
  words: { new: 'new', moved: 'moved' },
  label: (id: string) => id.replace('pkg:', ''),
  unit: (count: number) => (count === 1 ? '1 link' : `${count} links`),
};

describe('createEdgeStateCache', () => {
  it('gives the state edgeState computes, for every edge asked', () => {
    const cache = createEdgeStateCache(context);
    const edges = [
      aggregated('pkg:a', 'pkg:b', [L1, L2], true),
      aggregated('pkg:a', 'pkg:c', [L3]),
    ];
    for (const edge of edges) expect(cache.get(edge)).toEqual(edgeState(edge, context));
  });

  it('reuses the state of an edge asked again, as the same object', () => {
    const cache = createEdgeStateCache(context);
    const edge = aggregated('pkg:a', 'pkg:b', [L1, L2], true);
    expect(cache.get(edge)).toBe(cache.get(edge));
  });

  it('reuses the state when the pair comes back as an equal edge (same links)', () => {
    const cache = createEdgeStateCache(context);
    const first = cache.get(aggregated('pkg:a', 'pkg:b', [L1, L2], true));
    expect(cache.get(aggregated('pkg:a', 'pkg:b', [L1, L2], true))).toBe(first);
  });

  it('recomputes when the same pair now aggregates other links (a box opened or closed)', () => {
    const cache = createEdgeStateCache(context);
    cache.get(aggregated('pkg:a', 'pkg:b', [L1, L2], true));
    const narrower = aggregated('pkg:a', 'pkg:b', [L2]);
    expect(cache.get(narrower)).toEqual(edgeState(narrower, context));
    expect(cache.get(narrower).label).toBe('');
  });

  it('keeps the state of the pairs that stay across a series of edge sets', () => {
    const cache = createEdgeStateCache(context);
    const ab = aggregated('pkg:a', 'pkg:b', [L1, L2], true);
    const ac = aggregated('pkg:a', 'pkg:c', [L3]);
    const sets = [[ab], [ab, ac], [ac], [ab]];
    const first = cache.get(ab);
    for (const set of sets) {
      for (const edge of set) expect(cache.get(edge)).toEqual(edgeState(edge, context));
    }
    expect(cache.get(ab)).toBe(first);
  });
});
