import { describe, expect, it } from 'vitest';

import type { Edge, GraphSnapshot, Node } from '../../../core/models/contract';
import { hideExternalDeps } from './external.logic';

// API expected (ticket U13):
//   hideExternalDeps(graph, hide): GraphSnapshot - when `hide` is true, drops the `external` nodes,
//     the `external-group` module and every edge with one end among them; when false, returns the
//     graph as it is. The input is not mutated.

function node(id: string, kind: Node['kind'], parent: string | null, subkind = ''): Node {
  return { id, kind, subkind, parent, visibility: 'public', contentHash: '' } as Node;
}

function edge(from: string, to: string): Edge {
  return { from, to, kind: 'imports', precision: 'resolved' } as Edge;
}

const GRAPH: GraphSnapshot = {
  commit: 'c1',
  nodes: [
    node('pkg:repo', 'repo', null),
    node('pkg:app', 'package', 'pkg:repo'),
    node('pkg:app::file:a.ts', 'file', 'pkg:app'),
    node('pkg:app::file:b.ts', 'file', 'pkg:app'),
    node('pkg:external', 'module', 'pkg:repo', 'external-group'),
    node('pkg:external/react', 'external', 'pkg:external'),
    node('pkg:external/fastify', 'external', 'pkg:external'),
  ],
  edges: [
    edge('pkg:app::file:a.ts', 'pkg:app::file:b.ts'),
    edge('pkg:app::file:a.ts', 'pkg:external/react'),
    edge('pkg:app::file:b.ts', 'pkg:external/fastify'),
  ],
};

describe('hideExternalDeps', () => {
  it('drops the external group, the external packages and the edges leading to them', () => {
    const result = hideExternalDeps(GRAPH, true);
    expect(result.nodes.map((n) => n.id)).toEqual([
      'pkg:repo',
      'pkg:app',
      'pkg:app::file:a.ts',
      'pkg:app::file:b.ts',
    ]);
    expect(result.edges).toEqual([edge('pkg:app::file:a.ts', 'pkg:app::file:b.ts')]);
    expect(result.commit).toBe('c1');
  });

  it('returns the graph as it is when not hiding', () => {
    const result = hideExternalDeps(GRAPH, false);
    expect(result.nodes).toHaveLength(7);
    expect(result.edges).toHaveLength(3);
  });

  it('does not mutate its input', () => {
    hideExternalDeps(GRAPH, true);
    expect(GRAPH.nodes).toHaveLength(7);
    expect(GRAPH.edges).toHaveLength(3);
  });
});
