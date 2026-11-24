import type { GraphSnapshot } from '../../../core/models/contract';
import { labelOf } from './node-info.logic';
import { isWorkspaceRepo } from './repo-level.logic';

export type Crumb =
  | { kind: 'root'; label: string }
  | { kind: 'node'; id: string; label: string }
  | { kind: 'level'; level: number };

export interface BreadcrumbInput {
  graph: GraphSnapshot;
  repoName: string;
  selectedId: string | null;
  level: number;
}

/** Repository, then the ancestors down to the selected node; the current level when none. */
export function breadcrumbTrail({ graph, repoName, selectedId, level }: BreadcrumbInput): Crumb[] {
  const root: Crumb = { kind: 'root', label: repoName };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (selectedId === null || !byId.has(selectedId)) return [root, { kind: 'level', level }];
  const chain: Crumb[] = [];
  for (let id: string | null = selectedId; id;) {
    const node = byId.get(id);
    if (!node) break;
    if (node.kind !== 'repo' || isWorkspaceRepo(node))
      chain.unshift({ kind: 'node', id, label: labelOf(id, node.kind, node.path) });
    id = node.parent ?? null;
  }
  return [root, ...chain];
}
