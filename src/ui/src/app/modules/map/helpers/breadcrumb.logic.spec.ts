import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { breadcrumbTrail } from './breadcrumb.logic';

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const API = 'pkg:apps/api';
const AUTH = `${API}::mod:auth`;
const SESSION = `${API}::file:auth/session.ts`;
const REFRESH = `${SESSION}::sym:SessionStore.refresh`;

const GRAPH: GraphSnapshot = {
  commit: '0123456789abcdef0123456789abcdef01234567',
  edges: [],
  nodes: [
    node('pkg:acme', 'repo', null),
    node(API, 'service', 'pkg:acme'),
    node(AUTH, 'module', API),
    node(SESSION, 'file', AUTH),
    node(REFRESH, 'symbol', SESSION),
  ],
};

describe('breadcrumbTrail', () => {
  it('lists the ancestors of the selected node, from the repository down to the node', () => {
    const trail = breadcrumbTrail({
      graph: GRAPH,
      repoName: 'acme-shop',
      selectedId: REFRESH,
      level: 2,
    });
    expect(trail).toEqual([
      { kind: 'root', label: 'acme-shop' },
      { kind: 'node', id: API, label: 'apps/api' },
      { kind: 'node', id: AUTH, label: 'auth/' },
      { kind: 'node', id: SESSION, label: 'session.ts' },
      { kind: 'node', id: REFRESH, label: 'SessionStore.refresh' },
    ]);
  });

  it('stops at the node itself when a container is selected', () => {
    const trail = breadcrumbTrail({
      graph: GRAPH,
      repoName: 'acme-shop',
      selectedId: AUTH,
      level: 1,
    });
    expect(trail.map((c) => (c.kind === 'level' ? c.level : c.label))).toEqual([
      'acme-shop',
      'apps/api',
      'auth/',
    ]);
  });

  it('shows the current level after the repository when nothing is selected', () => {
    expect(
      breadcrumbTrail({ graph: GRAPH, repoName: 'acme-shop', selectedId: null, level: 2 }),
    ).toEqual([
      { kind: 'root', label: 'acme-shop' },
      { kind: 'level', level: 2 },
    ]);
  });

  it('falls back to the level when the selected id is unknown', () => {
    expect(
      breadcrumbTrail({ graph: GRAPH, repoName: 'acme-shop', selectedId: 'nope', level: 0 }),
    ).toEqual([
      { kind: 'root', label: 'acme-shop' },
      { kind: 'level', level: 0 },
    ]);
  });
});
