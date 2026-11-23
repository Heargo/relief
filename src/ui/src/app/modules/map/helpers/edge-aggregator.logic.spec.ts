import { describe, expect, it } from 'vitest';

import type { Edge, EdgeKind } from '../../../core/models/contract';
import { aggregateEdges, type AggregatedEdge } from './edges.logic';
import { createEdgeAggregator } from './edge-aggregator.logic';

function edge(from: string, to: string, kind: EdgeKind = 'calls'): Edge {
  return { from, to, kind, precision: 'resolved' };
}

const ROOT = 'pkg:acme';
const WEB = 'pkg:web';
const WEB_F1 = `${WEB}::file:a.ts`;
const WEB_F2 = `${WEB}::file:b.ts`;
const WEB_S1 = `${WEB_F1}::sym:s1`;
const WEB_S2 = `${WEB_F2}::sym:s2`;
const API = 'pkg:api';
const API_F = `${API}::file:r.ts`;
const API_S = `${API_F}::sym:r`;
const DB = 'pkg:db';
const DB_F = `${DB}::file:d.ts`;
const DB_S1 = `${DB_F}::sym:d1`;
const DB_S2 = `${DB_F}::sym:d2`;

const PARENTS = new Map<string, string | null>([
  [ROOT, null],
  [WEB, ROOT],
  [WEB_F1, WEB],
  [WEB_F2, WEB],
  [WEB_S1, WEB_F1],
  [WEB_S2, WEB_F2],
  [API, ROOT],
  [API_F, API],
  [API_S, API_F],
  [DB, ROOT],
  [DB_F, DB],
  [DB_S1, DB_F],
  [DB_S2, DB_F],
]);

const EDGES: Edge[] = [
  edge(WEB_S1, API_S),
  edge(WEB_S2, API_S, 'imports'),
  edge(WEB_S1, WEB_S2),
  edge(API_S, DB_S1),
  edge(API_S, DB_S2),
  edge(WEB_S2, DB_S1),
  edge(DB_S2, DB_S1),
  edge(DB_S1, 'ext:lib'),
];

// Changed: the web -> api call and the api -> db one on the first symbol.
const CHANGED = new Set([EDGES[0], EDGES[3]]);
const changed = (e: Edge): boolean => CHANGED.has(e);

// Modes changing step by step: boxes open, close, threshold crossed in both directions.
const STEPS: string[][] = [
  [WEB, API, DB],
  [WEB, API, DB, WEB_F1, WEB_F2],
  [WEB, API, DB, WEB_F1, WEB_F2, WEB_S1, WEB_S2],
  [WEB, API, DB, WEB_F1, WEB_F2],
  [WEB, API, DB],
  [WEB, API_F, DB_F],
  [WEB_F1, WEB_F2, API_F, DB_F, DB_S1, DB_S2],
  [],
  [WEB, API, DB],
  [ROOT],
  [WEB, API, DB],
];

describe('createEdgeAggregator', () => {
  it('gives, after every change of the visible boxes, what aggregateEdges computes from scratch', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { changed });
    for (const step of STEPS) {
      const visible = new Set(step);
      const expected = aggregateEdges(EDGES, PARENTS, visible, { changed });
      expect(aggregator.update(visible)).toEqual(expected);
    }
  });

  it('gives the same result for the same visible boxes whatever the path that led there', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { changed });
    const target = new Set([WEB_F1, WEB_F2, API, DB_F]);
    for (const step of STEPS) aggregator.update(new Set(step));
    expect(aggregator.update(target)).toEqual(aggregateEdges(EDGES, PARENTS, target, { changed }));
  });

  it('works without a changed predicate', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS);
    for (const step of STEPS) {
      const visible = new Set(step);
      expect(aggregator.update(visible)).toEqual(aggregateEdges(EDGES, PARENTS, visible));
    }
  });

  it('keeps the very same aggregated edge when the change of modes does not touch its pair', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { changed });
    const before = aggregator.update(new Set([WEB, API, DB]));
    const after = aggregator.update(new Set([WEB, API, DB, DB_F]));
    const pair = (edges: AggregatedEdge[], from: string, to: string) =>
      edges.find((e) => e.from === from && e.to === to);
    // web -> api sees no box change under it: same object.
    expect(pair(after, WEB, API)).toBeDefined();
    expect(pair(after, WEB, API)).toBe(pair(before, WEB, API));
    // api -> db now ends on db's file: the pair is rebuilt.
    expect(pair(after, API, DB_F)).toBeDefined();
    expect(pair(before, API, DB_F)).toBeUndefined();
  });

  it('returns a fresh array each time without mutating the previous one', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { changed });
    const first = aggregator.update(new Set([WEB, API, DB]));
    const snapshot = structuredClone(first);
    aggregator.update(new Set([WEB_F1, WEB_F2, API, DB]));
    expect(first).toEqual(snapshot);
  });
});
