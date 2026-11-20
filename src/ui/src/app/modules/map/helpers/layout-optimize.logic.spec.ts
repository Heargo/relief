import { describe, expect, it } from 'vitest';

import type {
  Edge,
  GraphSnapshot,
  Node,
  NodeKind,
  SnapshotResponse,
} from '../../../core/models/contract';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { crossingsAtLevel, layoutCrossings } from './crossings.logic';
import { alphabeticalOrder, optimizeOrder } from './layout-optimize.logic';
import { layoutGraph } from './layout.logic';

// Real snapshot of the acme-shop fixture (snapshot of `main...feat/promo-codes`):
// 132 nodes, 177 edges. With children ordered by id (the "alphabetical" order), the crossings of
// the aggregated edges are 29 at level 1, 436 at level 2 and 121 at level 3: 586 in total.
const GRAPH = (acmeShop as unknown as SnapshotResponse).graph;
const ALPHABETICAL_TOTAL = 586;

function total(graph: GraphSnapshot, order: ReturnType<typeof alphabeticalOrder>): number {
  return layoutCrossings(layoutGraph(graph, order), graph);
}

describe('alphabeticalOrder', () => {
  const order = alphabeticalOrder(GRAPH);

  it('lists the top-level nodes (children of the repo) under the null key, sorted by id', () => {
    expect(order.get(null)).toEqual([
      'pkg:@acme/api',
      'pkg:@acme/db',
      'pkg:@acme/shared',
      'pkg:@acme/web',
      'pkg:external',
    ]);
  });

  it('lists the children of each container sorted by id', () => {
    expect(order.get('pkg:external')).toEqual([
      'pkg:external/@tanstack/react-query',
      'pkg:external/drizzle-orm',
      'pkg:external/fastify',
      'pkg:external/react',
      'pkg:external/react-dom',
      'pkg:external/react-router',
      'pkg:external/stripe-sdk',
      'pkg:external/vitest',
    ]);
  });

  it('has the reference crossing count of 586 (29 + 436 + 121)', () => {
    const layout = layoutGraph(GRAPH, order);
    expect([1, 2, 3].map((level) => crossingsAtLevel(layout, GRAPH, level))).toEqual([
      29, 436, 121,
    ]);
    expect(layoutCrossings(layout, GRAPH)).toBe(ALPHABETICAL_TOTAL);
  });
});

describe('layoutGraph with an explicit order', () => {
  it('places the children of a container in the given order', () => {
    const order = alphabeticalOrder(GRAPH);
    const reversed = new Map(order);
    reversed.set('pkg:external', [...(order.get('pkg:external') ?? [])].reverse());
    const layout = layoutGraph(GRAPH, reversed);
    expect(layout.nodes.get('pkg:external')?.children).toEqual(reversed.get('pkg:external'));
  });
});

describe('optimizeOrder', () => {
  it('has at least 50% fewer crossings than the alphabetical order on acme-shop', () => {
    const { order } = optimizeOrder(GRAPH);
    const optimized = total(GRAPH, order);
    expect(optimized).toBeLessThanOrEqual(Math.floor(ALPHABETICAL_TOTAL / 2));
  });

  it('only reorders: every container keeps exactly its children', () => {
    const { order } = optimizeOrder(GRAPH);
    const alphabetical = alphabeticalOrder(GRAPH);
    const keys = (o: Map<string | null, string[]>) => [...o.keys()].map((k) => k ?? '').sort();
    expect(keys(order)).toEqual(keys(alphabetical));
    for (const [parent, children] of alphabetical) {
      expect([...(order.get(parent) ?? [])].sort()).toEqual([...children].sort());
    }
  });

  it('is deterministic: two runs give the same order', () => {
    const first = optimizeOrder(GRAPH);
    const second = optimizeOrder(GRAPH);
    expect([...first.order]).toEqual([...second.order]);
  });

  it('stops after at most 4 rounds and does not report an abort when the clock stands still', () => {
    const result = optimizeOrder(GRAPH, { now: () => 0 });
    expect(result.rounds).toBeGreaterThanOrEqual(1);
    expect(result.rounds).toBeLessThanOrEqual(4);
    expect(result.aborted).toBe(false);
  });

  it('gives up cleanly once the 300 ms budget is spent: valid order, never worse than the alphabetical one', () => {
    let calls = 0;
    // The first reading starts the budget, every later one is 100 ms further.
    const now = () => 100 * calls++;
    const result = optimizeOrder(GRAPH, { now });
    expect(result.aborted).toBe(true);
    const alphabetical = alphabeticalOrder(GRAPH);
    for (const [parent, children] of alphabetical) {
      expect([...(result.order.get(parent) ?? [])].sort()).toEqual([...children].sort());
    }
    expect(total(GRAPH, result.order)).toBeLessThanOrEqual(ALPHABETICAL_TOTAL);
  });

  it('aborts at once when the clock is already past the budget, and returns the alphabetical order', () => {
    let calls = 0;
    const now = () => (calls++ === 0 ? 0 : 10_000);
    const result = optimizeOrder(GRAPH, { now });
    expect(result.aborted).toBe(true);
    expect(total(GRAPH, result.order)).toBe(ALPHABETICAL_TOTAL);
  });

  it('keeps the best order found before the abort: a longer budget never does worse', () => {
    const run = (budgetMs: number) => {
      let calls = 0;
      return optimizeOrder(GRAPH, { budgetMs, now: () => calls++ });
    };
    // 1 "ms" per clock reading: a bigger budget lets more swaps happen.
    expect(total(GRAPH, run(1_000_000).order)).toBeLessThanOrEqual(total(GRAPH, run(50).order));
  });
});

describe('optimizeOrder and the first box shown', () => {
  // A level jump from the whole map frames the first top-level box the layout shows. The layout
  // sorts the top level by kind rank (packages before modules), so that box is not always the
  // first id: here "pkg:a" (a module) sorts first by id, but "pkg:b" (a package) is shown first.
  function node(id: string, kind: NodeKind, parent: string | null): Node {
    return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
  }
  const files = { 'pkg:b': 3, 'pkg:c': 2, 'pkg:d': 2, 'pkg:e': 4 };
  const nodes: Node[] = [
    node('pkg:acme', 'repo', null),
    node('pkg:a', 'module', 'pkg:acme'),
    node('pkg:a::file:x.ts', 'file', 'pkg:a'),
  ];
  for (const [pkg, count] of Object.entries(files)) {
    nodes.push(node(pkg, 'package', 'pkg:acme'));
    for (let i = 0; i < count; i++) nodes.push(node(`${pkg}::file:${i}.ts`, 'file', pkg));
  }
  const link = (from: string, to: string): Edge => ({
    from,
    to,
    kind: 'imports',
    precision: 'resolved',
  });
  const graph: GraphSnapshot = {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes,
    edges: [
      link('pkg:d::file:1.ts', 'pkg:a::file:x.ts'),
      link('pkg:e::file:2.ts', 'pkg:e::file:0.ts'),
      link('pkg:c::file:1.ts', 'pkg:b::file:1.ts'),
      link('pkg:e::file:1.ts', 'pkg:b::file:2.ts'),
      link('pkg:b::file:1.ts', 'pkg:c::file:1.ts'),
    ],
  };

  it('keeps the same first top-level box as the alphabetical order', () => {
    const alphabetical = alphabeticalOrder(graph);
    expect(alphabetical.get(null)?.[0]).toBe('pkg:a');
    const before = layoutGraph(graph, alphabetical).roots[0];
    expect(before).toBe('pkg:b');
    const after = layoutGraph(graph, optimizeOrder(graph).order).roots[0];
    expect(after).toBe(before);
  });
});
