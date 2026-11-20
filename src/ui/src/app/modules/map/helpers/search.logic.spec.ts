import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { buildSearchIndex, resultOfHit, searchNodes } from './search.logic';

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const API = 'pkg:apps/api';
const AUTH = `${API}::mod:auth`;
const SESSION = `${API}::file:auth/session.ts`;
const ROUTES = `${API}::mod:routes`;
const CHECKOUT = `${API}::file:routes/checkout.ts`;
const CART = `${API}::file:cart/summary.ts`;

const GRAPH: GraphSnapshot = {
  commit: '0123456789abcdef0123456789abcdef01234567',
  edges: [],
  nodes: [
    node('pkg:acme', 'repo', null),
    node(API, 'service', 'pkg:acme'),
    node(AUTH, 'module', API),
    node(SESSION, 'file', AUTH),
    node(`${SESSION}::sym:SessionStore.refresh`, 'symbol', SESSION),
    node(`${SESSION}::sym:refreshToken`, 'symbol', SESSION),
    node(`${SESSION}::sym:useRefreshGuard`, 'symbol', SESSION),
    node(ROUTES, 'module', API),
    node(CHECKOUT, 'file', ROUTES),
    node(`${CHECKOUT}::sym:postCheckout`, 'symbol', CHECKOUT),
    node(`${API}::file:cart/summary.ts::sym:totalOf`, 'symbol', CART),
    node(CART, 'file', API),
  ],
};

const INDEX = buildSearchIndex(GRAPH);

describe('searchNodes', () => {
  it('ranks an exact member name, then a prefix, then a substring', () => {
    const ids = searchNodes(INDEX, 'refresh').map((r) => r.id);
    expect(ids).toEqual([
      `${SESSION}::sym:SessionStore.refresh`,
      `${SESSION}::sym:refreshToken`,
      `${SESSION}::sym:useRefreshGuard`,
    ]);
  });

  it('is case-insensitive and ignores surrounding spaces', () => {
    const ids = searchNodes(INDEX, '  REFRESH ').map((r) => r.id);
    expect(ids[0]).toBe(`${SESSION}::sym:SessionStore.refresh`);
  });

  it('returns nothing for an empty query or when nothing matches', () => {
    expect(searchNodes(INDEX, '')).toEqual([]);
    expect(searchNodes(INDEX, '   ')).toEqual([]);
    expect(searchNodes(INDEX, 'zzzz-nope')).toEqual([]);
  });

  it('finds files and modules by name too', () => {
    const results = searchNodes(INDEX, 'session');
    expect(results.map((r) => r.id)).toContain(SESSION);
    expect(searchNodes(INDEX, 'auth').map((r) => r.id)).toContain(AUTH);
  });

  it('puts the file first for a path query such as /checkout', () => {
    const results = searchNodes(INDEX, '/checkout');
    expect(results[0]).toMatchObject({ id: CHECKOUT, kind: 'file', label: 'checkout.ts' });
    expect(results.map((r) => r.id)).not.toContain(`${SESSION}::sym:SessionStore.refresh`);
  });

  it('gives each result its kind, its label and its path', () => {
    const [first] = searchNodes(INDEX, 'SessionStore.refresh');
    expect(first).toMatchObject({
      id: `${SESSION}::sym:SessionStore.refresh`,
      kind: 'symbol',
      label: 'SessionStore.refresh',
    });
    expect(first.path).toContain('auth/session.ts');
  });

  it('caps the list at 8 results', () => {
    const many: GraphSnapshot = {
      ...GRAPH,
      nodes: [
        node('pkg:acme', 'repo', null),
        ...Array.from({ length: 20 }, (_, i) =>
          node(`pkg:acme::file:item${i}.ts`, 'file', 'pkg:acme'),
        ),
      ],
    };
    expect(searchNodes(buildSearchIndex(many), 'item')).toHaveLength(8);
  });
});

describe('resultOfHit', () => {
  it('shows a symbol by its name with the path of its file', () => {
    expect(
      resultOfHit({
        id: 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh',
        kind: 'symbol',
      }),
    ).toEqual({
      id: 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh',
      kind: 'symbol',
      label: 'SessionStore.refresh',
      path: 'apps/api/auth/session.ts',
    });
  });

  it('shows a file by its base name with its path', () => {
    expect(
      resultOfHit({
        id: 'pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts',
        kind: 'file',
      }),
    ).toEqual({
      id: 'pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts',
      kind: 'file',
      label: 'file-042.ts',
      path: 'packages/pkg-07/file-042.ts',
    });
  });

  it('shows a module by its last folder with a trailing slash', () => {
    expect(resultOfHit({ id: 'pkg:wide/packages/pkg-03', kind: 'module' })).toEqual({
      id: 'pkg:wide/packages/pkg-03',
      kind: 'module',
      label: 'pkg-03/',
      path: 'wide/packages/pkg-03',
    });
  });

  it('gives the same result as the local index for the same node', () => {
    const id = `${SESSION}::sym:refresh`;
    const graph: GraphSnapshot = {
      commit: 'c',
      edges: [],
      nodes: [node(id, 'symbol', SESSION)],
    };
    expect(resultOfHit({ id, kind: 'symbol' })).toEqual(
      searchNodes(buildSearchIndex(graph), 'refresh')[0],
    );
  });
});
