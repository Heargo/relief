import { describe, expect, it } from 'vitest';

import type { GraphSnapshot } from '../../../core/models/contract';
import { stepFocus } from './step-focus.logic';

// R19: `stepFocus(graph, current)` returns `{ nodes, edges }`: the ids that stay sharp (the current
// element, its direct neighbours along edges in both directions, and the boxes holding them) and
// the sharp edges, as `edgeKey(from, to)` (`from\0to`): those whose two ends are the current element
// or one of its neighbours. Everything else is faded (10 %).
const P = (n: string) => `pkg:@acme/${n}`;
const F = (n: string, f: string) => `${P(n)}::file:${f}.ts`;

const CURRENT = F('billing', 'invoice');
const CALLEE = F('db', 'repo');
const CALLER = F('web', 'page');
const FAR = F('shell', 'nav');
const UNRELATED = F('misc', 'util');

const node = (id: string, parent: string | null) => ({ id, parent });
const edge = (from: string, to: string) => ({ from, to, kind: 'imports', precision: 'exact' });
const key = (from: string, to: string) => `${from}\u0000${to}`;

const graph = {
  commit: 'abc',
  nodes: [
    node(P('billing'), null),
    node(CURRENT, P('billing')),
    node(P('db'), null),
    node(CALLEE, P('db')),
    node(P('web'), null),
    node(CALLER, P('web')),
    node(P('shell'), null),
    node(FAR, P('shell')),
    node(P('misc'), null),
    node(UNRELATED, P('misc')),
  ],
  edges: [
    edge(CURRENT, CALLEE),
    edge(CALLER, CURRENT),
    edge(CALLER, CALLEE),
    edge(FAR, CALLER),
    edge(UNRELATED, FAR),
  ],
} as unknown as GraphSnapshot;

describe('stepFocus', () => {
  it('keeps the current element, its sources and targets, and their containers', () => {
    expect([...stepFocus(graph, CURRENT).nodes].sort()).toEqual(
      [CURRENT, CALLEE, CALLER, P('billing'), P('db'), P('web')].sort(),
    );
  });

  it('fades what is two hops away or unrelated', () => {
    const { nodes } = stepFocus(graph, CURRENT);
    for (const id of [FAR, UNRELATED, P('shell'), P('misc')]) expect(nodes.has(id), id).toBe(false);
  });

  it('keeps the edges between the current element and its neighbours, neighbours together included', () => {
    expect([...stepFocus(graph, CURRENT).edges].sort()).toEqual(
      [key(CURRENT, CALLEE), key(CALLER, CURRENT), key(CALLER, CALLEE)].sort(),
    );
  });

  it('fades the edges that leave the neighbourhood', () => {
    const { edges } = stepFocus(graph, CURRENT);
    expect(edges.has(key(FAR, CALLER))).toBe(false);
    expect(edges.has(key(UNRELATED, FAR))).toBe(false);
  });

  it('follows the current element: another one gives another neighbourhood', () => {
    const { nodes, edges } = stepFocus(graph, FAR);
    expect([...nodes].sort()).toEqual(
      [FAR, CALLER, UNRELATED, P('shell'), P('web'), P('misc')].sort(),
    );
    expect([...edges].sort()).toEqual([key(FAR, CALLER), key(UNRELATED, FAR)].sort());
  });

  it('keeps only the element and its box when it has no edge', () => {
    const lone = { ...graph, edges: [] } as unknown as GraphSnapshot;
    const { nodes, edges } = stepFocus(lone, CURRENT);
    expect([...nodes].sort()).toEqual([CURRENT, P('billing')].sort());
    expect(edges.size).toBe(0);
  });
});
