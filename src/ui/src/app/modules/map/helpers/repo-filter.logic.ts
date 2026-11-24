import type { GraphSnapshot } from '../../../core/models/contract';
import { hasRepoLevel, isWorkspaceRepo, splitRepoId } from './repo-level.logic';

/**
 * The display filter by label: on a workspace, the repositories that carry one of the chosen
 * labels, with what they contain and the edges between what is kept. Without a chosen label, or
 * on a single repository, the graph as it is.
 */
export function filterReposByLabels(graph: GraphSnapshot, selected: string[]): GraphSnapshot {
  if (selected.length === 0 || !hasRepoLevel(graph)) return graph;
  const kept = new Set(
    graph.nodes
      .filter(isWorkspaceRepo)
      .filter((repo) => (repo.labels ?? []).some((label) => selected.includes(label)))
      .map((repo) => splitRepoId(repo.id).repo),
  );
  const nodes = graph.nodes.filter((n) => {
    const repo = splitRepoId(n.id).repo;
    return repo === null || kept.has(repo);
  });
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}
