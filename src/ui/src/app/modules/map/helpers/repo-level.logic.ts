import type { GraphSnapshot, Node } from '../../../core/models/contract';

/** The levels of the map, from the widest: `repos` exists on a workspace only. */
export type MapLevel = 'repos' | 'system' | 'modules' | 'files' | 'symbols';

/** What the box of a repository of a workspace says, and the systems it holds. */
export interface RepoBox {
  id: string;
  name: string;
  branch: string | null;
  labels: string[];
  /** Direct children of the repository, in snapshot order. */
  systems: string[];
}

/** A `repo:<name>` id cut into its repository and the id below it (empty for the repo itself). */
export function splitRepoId(id: string): { repo: string | null; local: string } {
  if (!id.startsWith('repo:')) return { repo: null, local: id };
  const rest = id.slice('repo:'.length);
  const slash = rest.indexOf('/');
  return slash < 0
    ? { repo: rest, local: '' }
    : { repo: rest.slice(0, slash), local: rest.slice(slash + 1) };
}

/**
 * The node of a repository of a workspace (`repo:<name>`, no parent). The root node of a single
 * repository has kind `repo` too, but a `pkg:` id.
 */
export function isWorkspaceRepo(node: Node): boolean {
  return node.kind === 'repo' && !node.parent && node.id.startsWith('repo:');
}

export function hasRepoLevel(graph: GraphSnapshot): boolean {
  return graph.nodes.some(isWorkspaceRepo);
}

/** The levels of the map of a snapshot, widest first. */
export function mapLevels(graph: GraphSnapshot): MapLevel[] {
  const levels: MapLevel[] = ['system', 'modules', 'files', 'symbols'];
  return hasRepoLevel(graph) ? ['repos', ...levels] : levels;
}

/** The repositories of a workspace snapshot; none on a single repository. */
export function repoBoxes(graph: GraphSnapshot): RepoBox[] {
  const repos = graph.nodes.filter(isWorkspaceRepo);
  return repos.map((repo) => ({
    id: repo.id,
    name: splitRepoId(repo.id).repo ?? repo.id,
    branch: repo.branch ?? null,
    labels: repo.labels ?? [],
    systems: graph.nodes.filter((n) => n.parent === repo.id).map((n) => n.id),
  }));
}

/**
 * Where the children of a node attach on the map: the root node of a repository (kind `repo`,
 * below a repository of a workspace or alone) draws nothing, so what it holds goes up to the
 * repository of the workspace, or to the top level.
 */
export function mapParent(node: Node, byId: ReadonlyMap<string, Node>): Node | undefined {
  let parent = node.parent ? byId.get(node.parent) : undefined;
  while (parent && parent.kind === 'repo' && !isWorkspaceRepo(parent)) {
    parent = parent.parent ? byId.get(parent.parent) : undefined;
  }
  return parent;
}
