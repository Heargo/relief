import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { filterReposByLabels } from './repo-filter.logic';

// K09, UI logic seam: the filter by label of the Display section keeps the repositories that carry
// one of the chosen labels, with what they contain, and the edges between what is kept.

function node(id: string, kind: NodeKind, parent: string | null, extra: Partial<Node> = {}): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h', ...extra };
}

const GRAPH: GraphSnapshot = {
  commit: '2'.repeat(40),
  nodes: [
    node('repo:web', 'repo', null, { labels: ['front'] }),
    node('repo:web/pkg:w', 'package', 'repo:web'),
    node('repo:web/pkg:w::file:a.ts', 'file', 'repo:web/pkg:w'),
    node('repo:api', 'repo', null, { labels: ['back', 'ops'] }),
    node('repo:api/pkg:a', 'package', 'repo:api'),
    node('repo:api/pkg:a::file:b.ts', 'file', 'repo:api/pkg:a'),
    node('repo:docs', 'repo', null, { labels: [] }),
    node('repo:docs/pkg:d', 'package', 'repo:docs'),
  ],
  edges: [
    { from: 'repo:web/pkg:w::file:a.ts', to: 'repo:api/pkg:a::file:b.ts', kind: 'imports' },
    { from: 'repo:api/pkg:a::file:b.ts', to: 'repo:docs/pkg:d', kind: 'imports' },
  ] as GraphSnapshot['edges'],
};

const ids = (graph: GraphSnapshot) => graph.nodes.map((n) => n.id);

describe('filterReposByLabels', () => {
  it('keeps everything when no label is chosen', () => {
    expect(filterReposByLabels(GRAPH, [])).toEqual(GRAPH);
  });

  it('keeps the repositories with the chosen label, and what they contain', () => {
    expect(ids(filterReposByLabels(GRAPH, ['back']))).toEqual([
      'repo:api',
      'repo:api/pkg:a',
      'repo:api/pkg:a::file:b.ts',
    ]);
  });

  it('keeps a repository that has any of several chosen labels', () => {
    expect(
      ids(filterReposByLabels(GRAPH, ['front', 'ops'])).filter((i) => !i.includes('/')),
    ).toEqual(['repo:web', 'repo:api']);
  });

  it('drops the edges that touch a hidden repository', () => {
    expect(filterReposByLabels(GRAPH, ['back']).edges).toEqual([]);
    expect(filterReposByLabels(GRAPH, ['front', 'back']).edges).toHaveLength(1);
  });

  it('hides the unlabelled repositories as soon as a label is chosen', () => {
    expect(ids(filterReposByLabels(GRAPH, ['front']))).not.toContain('repo:docs');
  });

  it('leaves a single repository snapshot alone', () => {
    const mono: GraphSnapshot = {
      commit: '1'.repeat(40),
      edges: [],
      nodes: [node('pkg:acme', 'repo', null), node('pkg:acme/web', 'service', 'pkg:acme')],
    };
    expect(filterReposByLabels(mono, ['front'])).toEqual(mono);
  });
});
