import { describe, expect, it } from 'vitest';

import type { Node } from '../../../core/models/contract';
import { aggregateEdges } from '../../map/helpers/edges.logic';
import { coChangeEdges, type CoChangePair } from './co-change.logic';

// Expected API (co-change.logic.ts, pure), fed with the answer of `co_change` (pairs of repository
// paths `{ a, b, commits, support, confidence }`; the contract gains `CoChangePair` and the edge
// kind `co_change`):
//  - coChangeEdges(pairs, nodes): one fine edge `{ from, to, kind: 'co_change', precision:
//    'resolved' }` per pair, from the file node of `a` to the file node of `b` (a file node's id
//    contains `::file:<path>`); a pair of which one file is not on the map (deleted, excluded)
//    gives no edge;
//  - the edges go through the usual `aggregateEdges`, so that they merge per level like the others.
const PKG = 'pkg:acme';
const WEB = 'pkg:acme/web';
const API = 'pkg:acme/api';
const WEB_A = `${WEB}::file:web/a.ts`;
const WEB_B = `${WEB}::file:web/b.ts`;
const API_C = `${API}::file:api/c.ts`;
const API_D = `${API}::file:api/d.ts`;

function node(id: string, kind: Node['kind'], parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const NODES: Node[] = [
  node(PKG, 'package', null),
  node(WEB, 'module', PKG),
  node(API, 'module', PKG),
  node(WEB_A, 'file', WEB),
  node(WEB_B, 'file', WEB),
  node(API_C, 'file', API),
  node(API_D, 'file', API),
];
const PARENTS = new Map(NODES.map((n) => [n.id, n.parent ?? null]));

function pair(a: string, b: string, commits = 3): CoChangePair {
  return { a, b, commits, support: 0.5, confidence: 0.75 };
}

describe('coChangeEdges', () => {
  it('turns a pair of paths into a co_change edge between the two file nodes', () => {
    expect(coChangeEdges([pair('web/a.ts', 'api/c.ts')], NODES)).toEqual([
      { from: WEB_A, to: API_C, kind: 'co_change', precision: 'resolved' },
    ]);
  });

  it('drops a pair of which one file is not on the map', () => {
    const edges = coChangeEdges(
      [
        pair('web/a.ts', 'gone/old.ts'),
        pair('gone/older.ts', 'api/c.ts'),
        pair('web/a.ts', 'web/b.ts'),
      ],
      NODES,
    );
    expect(edges.map((e) => [e.from, e.to])).toEqual([[WEB_A, WEB_B]]);
  });

  it('gives nothing without pairs', () => {
    expect(coChangeEdges([], NODES)).toEqual([]);
  });

  it('does not take a symbol for a file', () => {
    const withSymbol = [...NODES, node(`${WEB_A}::sym:run`, 'symbol', WEB_A)];
    const edges = coChangeEdges([pair('web/a.ts', 'api/c.ts')], withSymbol);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(WEB_A);
  });

  it('merges per level through aggregateEdges: two file pairs make one module edge', () => {
    const edges = coChangeEdges(
      [pair('web/a.ts', 'api/c.ts'), pair('web/b.ts', 'api/d.ts'), pair('web/a.ts', 'web/b.ts')],
      NODES,
    );
    const modules = aggregateEdges(edges, PARENTS, new Set([WEB, API]));
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ from: WEB, to: API, count: 2, kinds: ['co_change'] });

    const files = aggregateEdges(edges, PARENTS, new Set([WEB_A, WEB_B, API_C, API_D]));
    expect(files).toHaveLength(3);
  });
});
