import { describe, expect, it } from 'vitest';

import type { Edge, EdgeKind } from '../../../core/models/contract';
import { createEdgeAggregator } from './edge-aggregator.logic';
import { aggregateEdges } from './edges.logic';

// U30: with the symbols visible, the edges stop at the file, except those of the unfolded node
// (selected or hovered), which go down to the symbols. `isSymbol` and `unfolded` are the new
// options of `aggregateEdges` (and of `createEdgeAggregator` for `isSymbol`, `update` for `unfolded`).

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
  edge(WEB_S1, API_S), // 0
  edge(WEB_S2, API_S, 'imports'), // 1
  edge(WEB_S1, WEB_S2), // 2
  edge(API_S, DB_S1), // 3
  edge(API_S, DB_S2), // 4
  edge(WEB_S2, DB_S1), // 5
  edge(DB_S2, DB_S1), // 6, inside one file
];

const isSymbol = (id: string): boolean => id.includes('::sym:');
const CHANGED = new Set([EDGES[0], EDGES[3]]);
const changed = (e: Edge): boolean => CHANGED.has(e);

// The symbols level: files open, symbols are boxes.
const SYMBOLS_LEVEL = [
  WEB,
  API,
  DB,
  WEB_F1,
  WEB_F2,
  API_F,
  DB_F,
  WEB_S1,
  WEB_S2,
  API_S,
  DB_S1,
  DB_S2,
];

const ends = (edges: ReturnType<typeof aggregateEdges>) =>
  edges.map((e) => `${e.from} > ${e.to} x${e.count}`);

describe('edges at the shown level (symbols visible)', () => {
  it('stops at the file, one edge per pair of files, the count being the number of links', () => {
    const edges = aggregateEdges(EDGES, PARENTS, new Set(SYMBOLS_LEVEL), { isSymbol });
    expect(ends(edges)).toEqual([
      `${WEB_F1} > ${API_F} x1`,
      `${WEB_F2} > ${API_F} x1`,
      `${WEB_F1} > ${WEB_F2} x1`,
      `${API_F} > ${DB_F} x2`,
      `${WEB_F2} > ${DB_F} x1`,
    ]);
    expect(edges[3].links).toEqual([EDGES[3], EDGES[4]]);
    expect(edges[3].kinds).toEqual(['calls']);
  });

  it('keeps the changed flag of the links folded into a file edge', () => {
    const edges = aggregateEdges(EDGES, PARENTS, new Set(SYMBOLS_LEVEL), { isSymbol, changed });
    expect(edges.map((e) => e.changed)).toEqual([true, false, false, true, false]);
  });

  it('with an empty unfolded set, gives the same as without one', () => {
    const visible = new Set(SYMBOLS_LEVEL);
    expect(aggregateEdges(EDGES, PARENTS, visible, { isSymbol, unfolded: new Set() })).toEqual(
      aggregateEdges(EDGES, PARENTS, visible, { isSymbol }),
    );
  });

  it('goes down to the symbols for the edges of an unfolded file, the others stay on files', () => {
    const edges = aggregateEdges(EDGES, PARENTS, new Set(SYMBOLS_LEVEL), {
      isSymbol,
      unfolded: new Set([WEB_F1]),
    });
    expect(ends(edges)).toEqual([
      `${WEB_S1} > ${API_S} x1`,
      `${WEB_F2} > ${API_F} x1`,
      `${WEB_S1} > ${WEB_S2} x1`,
      `${API_F} > ${DB_F} x2`,
      `${WEB_F2} > ${DB_F} x1`,
    ]);
  });

  it('goes down to the symbols for the edges of an unfolded symbol only', () => {
    const edges = aggregateEdges(EDGES, PARENTS, new Set(SYMBOLS_LEVEL), {
      isSymbol,
      unfolded: new Set([API_S]),
    });
    expect(ends(edges)).toEqual([
      `${WEB_S1} > ${API_S} x1`,
      `${WEB_S2} > ${API_S} x1`,
      `${WEB_F1} > ${WEB_F2} x1`,
      `${API_S} > ${DB_S1} x1`,
      `${API_S} > ${DB_S2} x1`,
      `${WEB_F2} > ${DB_F} x1`,
    ]);
  });

  it('unfolds the internal edges of a file too', () => {
    const edges = aggregateEdges(EDGES, PARENTS, new Set(SYMBOLS_LEVEL), {
      isSymbol,
      unfolded: new Set([DB_F]),
    });
    expect(ends(edges)).toEqual([
      `${WEB_F1} > ${API_F} x1`,
      `${WEB_F2} > ${API_F} x1`,
      `${WEB_F1} > ${WEB_F2} x1`,
      `${API_S} > ${DB_S1} x1`,
      `${API_S} > ${DB_S2} x1`,
      `${WEB_S2} > ${DB_S1} x1`,
      `${DB_S2} > ${DB_S1} x1`,
    ]);
  });

  it('changes nothing above the symbols: a file box without visible symbols is its own end', () => {
    const visible = new Set([WEB, API, DB, WEB_F1, WEB_F2, API_F, DB_F]);
    expect(
      aggregateEdges(EDGES, PARENTS, visible, { isSymbol, unfolded: new Set([WEB_F1]) }),
    ).toEqual(aggregateEdges(EDGES, PARENTS, visible));
  });
});

describe('createEdgeAggregator at the shown level', () => {
  // Visibility and unfolded node moving together or apart, symbols level included.
  const STEPS: Array<[string[], string[]]> = [
    [[WEB, API, DB], []],
    [SYMBOLS_LEVEL, []],
    [SYMBOLS_LEVEL, [WEB_F1]],
    [SYMBOLS_LEVEL, [WEB_F1, API_S]],
    [SYMBOLS_LEVEL, [API_S]],
    [SYMBOLS_LEVEL, []],
    [SYMBOLS_LEVEL, [DB_F]],
    [[WEB, API, DB, WEB_F1, WEB_F2, API_F, DB_F], [DB_F]],
    [SYMBOLS_LEVEL, [DB_F]],
    [SYMBOLS_LEVEL, [WEB_S1]],
    [[ROOT], [WEB_S1]],
    [SYMBOLS_LEVEL, []],
  ];

  it('gives, at every step, what aggregateEdges computes from scratch', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { changed, isSymbol });
    for (const [visible, unfolded] of STEPS) {
      const v = new Set(visible);
      const u = new Set(unfolded);
      expect(aggregator.update(v, u)).toEqual(
        aggregateEdges(EDGES, PARENTS, v, { changed, isSymbol, unfolded: u }),
      );
    }
  });

  it('folds to the files without an unfolded set', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { isSymbol });
    expect(ends(aggregator.update(new Set(SYMBOLS_LEVEL)))).toEqual([
      `${WEB_F1} > ${API_F} x1`,
      `${WEB_F2} > ${API_F} x1`,
      `${WEB_F1} > ${WEB_F2} x1`,
      `${API_F} > ${DB_F} x2`,
      `${WEB_F2} > ${DB_F} x1`,
    ]);
  });

  it('refolds the edges when the unfolded node goes away, with the same visible boxes', () => {
    const aggregator = createEdgeAggregator(EDGES, PARENTS, { isSymbol });
    const visible = new Set(SYMBOLS_LEVEL);
    const folded = aggregator.update(visible, new Set());
    aggregator.update(visible, new Set([WEB_F1]));
    expect(aggregator.update(visible, new Set())).toEqual(folded);
  });
});
