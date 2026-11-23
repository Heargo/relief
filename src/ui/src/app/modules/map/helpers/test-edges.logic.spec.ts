import { describe, expect, it } from 'vitest';

import type { Edge, EdgeKind } from '../../../core/models/contract';
import { foldTestEdges } from './test-edges.logic';

// R17: the edges whose source is a test are folded (not drawn) while the "Tests" layer is
// collapsed; their target gets a "tested by N (of which M new)" badge. `foldTestEdges(edges, opts)`
// returns the edges to draw and the badges per target box. `isTest` tells the nodes flagged
// `isTest` by the core; `shown` (default: identity) maps an end to the box that is drawn.

function edge(from: string, to: string, kind: EdgeKind = 'imports'): Edge {
  return { from, to, kind, precision: 'resolved' };
}

const PRICING = 'pkg:app::file:src/pricing.ts';
const CART = 'pkg:app::file:src/cart.ts';
const PRICING_TEST = 'pkg:app::file:tests/pricing.test.ts';
const PRICING_SPEC = 'pkg:app::file:tests/pricing.spec.ts';
const CART_TEST = 'pkg:app::file:tests/cart.test.ts';
const PRICING_SYM = `${PRICING}::sym:total`;
const PRICING_TEST_SYM = `${PRICING_TEST}::sym:suite`;

const TESTS = new Set([PRICING_TEST, PRICING_SPEC, CART_TEST]);
const isTest = (id: string): boolean => TESTS.has(id);

const E_CODE = edge(CART, PRICING); // code -> code
const E_T1 = edge(PRICING_TEST, PRICING); // test -> code
const E_T2 = edge(PRICING_SPEC, PRICING);
const E_T3 = edge(CART_TEST, CART);
const E_TT = edge(PRICING_TEST, CART_TEST); // test -> test
const EDGES = [E_CODE, E_T1, E_T2, E_T3, E_TT];

const NONE: ReadonlySet<string> = new Set();

const base = {
  isTest,
  layerOn: false,
  selected: null as string | null,
  unfolded: NONE,
};

describe('foldTestEdges, layer collapsed', () => {
  it('drops the edges whose source is a test and keeps the others in order', () => {
    const { edges } = foldTestEdges(EDGES, base);
    expect(edges).toEqual([E_CODE]);
  });

  it('puts a badge on each target: the number of distinct test sources', () => {
    const { badges } = foldTestEdges(EDGES, base);
    expect([...badges.keys()].sort()).toEqual([CART, PRICING].sort());
    expect(badges.get(PRICING)).toEqual({ count: 2, added: 0 });
    expect(badges.get(CART)).toEqual({ count: 1, added: 0 });
  });

  it('counts one test once, whatever the number of edges it has to the target', () => {
    const calls = edge(PRICING_TEST, PRICING, 'calls');
    const { badges } = foldTestEdges([E_T1, calls], base);
    expect(badges.get(PRICING)).toEqual({ count: 1, added: 0 });
  });

  it('counts as new the tests with at least one changed edge to the target', () => {
    const { badges } = foldTestEdges(EDGES, { ...base, changed: (e) => e === E_T2 });
    expect(badges.get(PRICING)).toEqual({ count: 2, added: 1 });
    expect(badges.get(CART)).toEqual({ count: 1, added: 0 });
  });

  it('puts no badge on a test (test to test edges are folded without one)', () => {
    const { badges } = foldTestEdges([E_TT], base);
    expect(badges.size).toBe(0);
  });

  it('leaves an edge between two code nodes untouched, with no badge', () => {
    const { edges, badges } = foldTestEdges([E_CODE], base);
    expect(edges).toEqual([E_CODE]);
    expect(badges.size).toBe(0);
  });
});

describe('foldTestEdges, unfolding', () => {
  it('keeps the edges of the selected test, the others stay folded', () => {
    const { edges } = foldTestEdges(EDGES, { ...base, selected: PRICING_TEST });
    expect(edges).toEqual([E_CODE, E_T1, E_TT]);
  });

  it('keeps the test edges of an unfolded target (click on its badge)', () => {
    const { edges } = foldTestEdges(EDGES, { ...base, unfolded: new Set([PRICING]) });
    expect(edges).toEqual([E_CODE, E_T1, E_T2]);
  });

  it('keeps the badge of an unfolded target, with the same numbers', () => {
    const { badges } = foldTestEdges(EDGES, { ...base, unfolded: new Set([PRICING]) });
    expect(badges.get(PRICING)).toEqual({ count: 2, added: 0 });
  });

  it('does not unfold anything when the selected node is the target, not a test', () => {
    const { edges } = foldTestEdges(EDGES, { ...base, selected: PRICING });
    expect(edges).toEqual([E_CODE]);
  });
});

describe('foldTestEdges, layer expanded', () => {
  it('draws everything, as before, with no badge', () => {
    const { edges, badges } = foldTestEdges(EDGES, { ...base, layerOn: true });
    expect(edges).toEqual(EDGES);
    expect(badges.size).toBe(0);
  });
});

describe('foldTestEdges, with the ends mapped to the boxes shown', () => {
  // The symbols are folded into their file: the test suite symbol counts as its test file, and the
  // tested symbol as the file box that carries the badge.
  const shown = (id: string): string | null => id.split('::sym:')[0] ?? id;
  const symEdge = edge(PRICING_TEST_SYM, PRICING_SYM, 'calls');

  it('judges the source by its box and badges the target box', () => {
    const { edges, badges } = foldTestEdges([symEdge, E_T1], { ...base, shown });
    expect(edges).toEqual([]);
    expect(badges.get(PRICING)).toEqual({ count: 1, added: 0 });
  });

  it('skips the edges whose end is not on the map', () => {
    const hidden = (id: string): string | null => (id === PRICING ? null : id);
    const { edges, badges } = foldTestEdges([E_T1, E_CODE], { ...base, shown: hidden });
    expect(edges).toEqual([E_CODE]);
    expect(badges.size).toBe(0);
  });
});
