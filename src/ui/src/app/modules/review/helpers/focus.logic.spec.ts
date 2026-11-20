import { describe, expect, it } from 'vitest';

import type { GraphSnapshot } from '../../../core/models/contract';
import { focusSet } from './focus.logic';

const P = (n: string) => `pkg:@acme/${n}`;
const F = (n: string, f: string) => `${P(n)}::file:${f}.ts`;
const S = (n: string, f: string, s: string) => `${F(n, f)}::sym:${s}`;

const CHANGED = S('billing', 'total', 'computeTotal');
const CALLEE = S('db', 'repo', 'findDiscount');
const CALLER = S('web', 'page', 'CheckoutPage');
const FAR = S('shell', 'nav', 'renderNav');
const UNRELATED = S('misc', 'util', 'noop');

const node = (id: string, parent: string | null) => ({ id, parent });
const edge = (from: string, to: string) => ({ from, to, kind: 'calls', precision: 'exact' });

const graph = {
  commit: 'abc',
  nodes: [
    node(P('billing'), null),
    node(F('billing', 'total'), P('billing')),
    node(CHANGED, F('billing', 'total')),
    node(P('db'), null),
    node(F('db', 'repo'), P('db')),
    node(CALLEE, F('db', 'repo')),
    node(P('web'), null),
    node(F('web', 'page'), P('web')),
    node(CALLER, F('web', 'page')),
    node(P('shell'), null),
    node(F('shell', 'nav'), P('shell')),
    node(FAR, F('shell', 'nav')),
    node(P('misc'), null),
    node(F('misc', 'util'), P('misc')),
    node(UNRELATED, F('misc', 'util')),
  ],
  edges: [
    edge(CHANGED, CALLEE),
    edge(CALLER, CHANGED),
    edge(FAR, CALLER),
    edge(UNRELATED, UNRELATED),
  ],
} as unknown as GraphSnapshot;

describe('focusSet', () => {
  it('keeps the changed symbols and their neighbours at one hop, in both directions', () => {
    const set = focusSet(graph, [CHANGED]);
    expect(set.has(CHANGED)).toBe(true);
    expect(set.has(CALLEE)).toBe(true);
    expect(set.has(CALLER)).toBe(true);
  });

  it('drops what is two hops away or unrelated', () => {
    const set = focusSet(graph, [CHANGED]);
    expect(set.has(FAR)).toBe(false);
    expect(set.has(UNRELATED)).toBe(false);
  });

  it('keeps the boxes that contain a kept node, and only those', () => {
    const set = focusSet(graph, [CHANGED]);
    for (const id of [
      F('billing', 'total'),
      P('billing'),
      F('db', 'repo'),
      P('db'),
      F('web', 'page'),
      P('web'),
    ]) {
      expect(set.has(id), id).toBe(true);
    }
    expect(set.has(F('shell', 'nav'))).toBe(false);
    expect(set.has(P('shell'))).toBe(false);
    expect(set.has(P('misc'))).toBe(false);
  });

  it('is exactly the changed nodes, their neighbours and their containers', () => {
    expect([...focusSet(graph, [CHANGED])].sort()).toEqual(
      [
        CHANGED,
        CALLEE,
        CALLER,
        F('billing', 'total'),
        F('db', 'repo'),
        F('web', 'page'),
        P('billing'),
        P('db'),
        P('web'),
      ].sort(),
    );
  });

  it('is null when no symbol changed, so that nothing is faded', () => {
    expect(focusSet(graph, [])).toBeNull();
  });

  it('is null for a graph without any node as well', () => {
    expect(
      focusSet({ commit: 'abc', nodes: [], edges: [] } as unknown as GraphSnapshot, []),
    ).toBeNull();
  });
});
