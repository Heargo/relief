import type {
  DiffResponse,
  Edge,
  GraphDiff,
  GraphSnapshot,
  MetaResponse,
  NodeChange,
} from '../../../core/models/contract';

/** What the diff layer says about a node or an edge. `modified` also stands for mixed containers. */
export type DiffStatus = 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';

export type DiffBadge = 'breaking-api' | 'api' | 'internal-signature' | 'format-only';

/** Everything the map needs to paint one node. */
export interface NodeMark {
  status: DiffStatus;
  /** 1 to 3, from the size of the change. */
  intensity: 1 | 2 | 3;
  badges: DiffBadge[];
  /** The former place of a moved node: drawn as a ghost, not as a node of the PR. */
  oldLocation: boolean;
}

export interface PrStats {
  files: number;
  linesAdded: number;
  linesRemoved: number;
  symbols: { added: number; removed: number; modified: number; moved: number };
  signatures: number;
  filesMoved: number;
  formatOnlyFiles: number;
}

const SYMBOL_SEPARATOR = '::sym:';

function isSymbol(id: string): boolean {
  return id.includes(SYMBOL_SEPARATOR);
}

/** Repository path of the file a node id lives in, or null for a container above the files. */
function filePath(id: string): string | null {
  const match = /::file:(.+?)(?:::|$)/.exec(id);
  return match?.[1] ?? null;
}

/** Status shown for a container, from the status of everything it holds. */
export function containerStatus(descendants: DiffStatus[]): DiffStatus {
  if (descendants.every((s) => s === 'unchanged')) return 'unchanged';
  const first = descendants[0];
  if (first !== 'modified' && descendants.every((s) => s === first)) return first ?? 'unchanged';
  return 'modified';
}

function renamedTo(response: DiffResponse): Set<string> {
  return new Set(response.renames.map((r) => r.to));
}

/** Status of a node as the diff lists it; a renamed file reads as moved, not added. */
export function nodeStatus(id: string, response: DiffResponse): DiffStatus {
  const change = response.diff.nodes.find((n) => n.id === id);
  if (!change) return 'unchanged';
  if (change.status === 'added' && !isSymbol(id)) {
    const path = filePath(id);
    if (path !== null && renamedTo(response).has(path)) return 'moved';
  }
  return change.status;
}

/** Former places: the `from` of moved symbols and the old file nodes of renames. */
export function oldLocations(response: DiffResponse): Set<string> {
  const result = new Set<string>();
  const renamedFrom = new Set(response.renames.map((r) => r.from));
  for (const change of response.diff.nodes) {
    if (change.status === 'moved') result.add(change.from);
    else if (change.status === 'removed' && !isSymbol(change.id)) {
      const path = filePath(change.id);
      if (path !== null && renamedFrom.has(path)) result.add(change.id);
    }
  }
  return result;
}

/** 1 up to 5 changed lines, 2 up to 20, 3 beyond. */
export function diffIntensity(lines: number): 1 | 2 | 3 {
  if (lines <= 5) return 1;
  if (lines <= 20) return 2;
  return 3;
}

/** Files git reports as changed that carry no node change and were not renamed. */
export function formatOnlyFiles(response: DiffResponse): string[] {
  const touched = new Set<string>();
  for (const change of response.diff.nodes) {
    const path = filePath(change.id);
    if (path !== null) touched.add(path);
  }
  // A changed edge leaving the file or one of its symbols is a change too, not a format touch.
  for (const edge of response.diff.edges) {
    const path = filePath(edge.from);
    if (path !== null) touched.add(path);
  }
  const renamed = renamedTo(response);
  return response.diff.files.map((f) => f.path).filter((p) => !touched.has(p) && !renamed.has(p));
}

export function nodeBadges(id: string, response: DiffResponse): DiffBadge[] {
  const change = response.diff.nodes.find((n) => n.id === id);
  if (change?.status === 'modified' && change.signature) {
    const { breaking, internal } = change.signature;
    if (breaking) return ['breaking-api'];
    return [internal ? 'internal-signature' : 'api'];
  }
  if (!change && !isSymbol(id)) {
    const path = filePath(id);
    if (path !== null && formatOnlyFiles(response).includes(path)) return ['format-only'];
  }
  return [];
}

/** Status of a fine edge, matched by (from, to, kind). */
export function edgeStatus(edge: Edge, diff: GraphDiff): DiffStatus {
  const change = diff.edges.find(
    (e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind,
  );
  return change?.status ?? 'unchanged';
}

/** Status of an aggregated edge: added or removed only when every fine link is. */
export function aggregateEdgeStatus(links: DiffStatus[]): DiffStatus {
  return containerStatus(links);
}

export function prStats(response: DiffResponse): PrStats {
  const stats: PrStats = {
    files: response.diff.files.length,
    linesAdded: response.diff.files.reduce((sum, f) => sum + f.linesAdded, 0),
    linesRemoved: response.diff.files.reduce((sum, f) => sum + f.linesRemoved, 0),
    symbols: { added: 0, removed: 0, modified: 0, moved: 0 },
    signatures: 0,
    filesMoved: response.renames.length,
    formatOnlyFiles: response.formatOnly.files,
  };
  for (const change of response.diff.nodes) {
    if (!isSymbol(change.id)) continue;
    stats.symbols[change.status]++;
    if (change.status === 'modified' && change.signature) stats.signatures++;
  }
  return stats;
}

/** Ranges between the refs of `/api/meta`, in both directions, never a ref against itself. */
export function rangeOptions(meta: MetaResponse): string[] {
  const refs = [...meta.branches, ...meta.tags];
  const options: string[] = [];
  for (const base of refs) {
    for (const head of refs) {
      if (base !== head) options.push(`${base}...${head}`);
    }
  }
  return options;
}

/** The range of a repo opened without one: the working tree compared to HEAD. */
export const WORKTREE_RANGE = 'WORKTREE';

/** The value of the range selector: no range means the working tree. */
export function currentRange(range: string | null): string {
  return range ?? WORKTREE_RANGE;
}

/** Options of the range selector: the working tree without a range, and the current range. */
export function rangeChoices(meta: MetaResponse, current: string | null): string[] {
  const options = rangeOptions(meta);
  if (current === null) return [WORKTREE_RANGE, ...options];
  return !options.includes(current) ? [current, ...options] : options;
}

/**
 * Marks of every node of the graph. A container takes the status of what it holds, its size the
 * sum of its children; a file takes its lines from git, a symbol from its own change.
 */
export function diffMarks(graph: GraphSnapshot, response: DiffResponse): Map<string, NodeMark> {
  const changes = new Map<string, NodeChange>(response.diff.nodes.map((n) => [n.id, n]));
  const fileLines = new Map(
    response.diff.files.map((f) => [f.path, f.linesAdded + f.linesRemoved] as const),
  );
  const old = oldLocations(response);
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.parent) continue;
    const list = children.get(node.parent);
    if (list) list.push(node.id);
    else children.set(node.parent, [node.id]);
  }
  const marks = new Map<string, NodeMark>();
  const linesOf = new Map<string, number>();

  const visit = (id: string): { status: DiffStatus; lines: number } => {
    const known = marks.get(id);
    if (known) return { status: known.status, lines: linesOf.get(id) ?? 0 };
    const held = (children.get(id) ?? []).filter((c) => !old.has(c)).map(visit);
    const change = changes.get(id);
    const path = isSymbol(id) ? null : filePath(id);
    const gitLines = path === null ? undefined : fileLines.get(path);
    const fromChildren = held.reduce((sum, h) => sum + h.lines, 0);
    let lines = fromChildren;
    if (gitLines !== undefined) lines = gitLines;
    else if (change) lines = change.linesAdded + change.linesRemoved || fromChildren;
    const status = old.has(id)
      ? 'unchanged'
      : change
        ? nodeStatus(id, response)
        : containerStatus(held.map((h) => h.status));
    marks.set(id, {
      status,
      intensity: diffIntensity(lines),
      badges: old.has(id) ? [] : nodeBadges(id, response),
      oldLocation: old.has(id),
    });
    linesOf.set(id, lines);
    return { status, lines };
  };
  for (const node of graph.nodes) visit(node.id);
  return marks;
}

/**
 * The head graph plus what only the base side knows and the diff talks about: removed nodes, former
 * places of moved nodes (with their ancestors) and removed edges. Everything else of the base is
 * left out, so the map keeps the shape of the head.
 */
export function withBaseOnly(
  head: GraphSnapshot,
  base: GraphSnapshot,
  response: DiffResponse,
): GraphSnapshot {
  const present = new Set(head.nodes.map((n) => n.id));
  const wanted = new Set<string>(oldLocations(response));
  for (const change of response.diff.nodes) if (change.status === 'removed') wanted.add(change.id);
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const restored = new Map<string, GraphSnapshot['nodes'][number]>();
  for (const id of wanted) {
    for (let cur = baseNodes.get(id); cur && !present.has(cur.id);) {
      if (restored.has(cur.id)) break;
      restored.set(cur.id, cur);
      cur = cur.parent ? baseNodes.get(cur.parent) : undefined;
    }
  }
  const known = new Set(head.edges.map((e) => `${e.from}\u0000${e.to}\u0000${e.kind}`));
  const removedEdges = new Set(
    response.diff.edges
      .filter((e) => e.status === 'removed')
      .map((e) => `${e.from}\u0000${e.to}\u0000${e.kind}`),
  );
  const edges = base.edges.filter((e) => {
    const key = `${e.from}\u0000${e.to}\u0000${e.kind}`;
    return removedEdges.has(key) && !known.has(key);
  });
  if (restored.size === 0 && edges.length === 0) return head;
  return {
    ...head,
    nodes: [...head.nodes, ...restored.values()],
    edges: [...head.edges, ...edges],
  };
}
