import type {
  DiffResponse,
  GraphSnapshot,
  Node,
  NodeChange,
  SnapshotResponse,
} from '../../../core/models/contract';
import { withBaseOnly } from '../../review/helpers/diff-layer.logic';

export type ExploreMode = 'review' | 'explore';

export interface ExploreView {
  graph: GraphSnapshot;
  marks: Map<string, NodeChange>;
}

export interface EntryGroup {
  type: string;
  nodes: Node[];
}

export interface Overview {
  detector: string;
  packages: number;
  externals: number;
  files: number;
  symbols: number;
  links: Record<string, number>;
}

const ENTRY_ORDER = ['route', 'page', 'job', 'script', 'main'];

/**
 * The map of the toggle "Relire la PR" / "Explorer le repo": in review, the head plus what only the
 * base knows, with the diff marks; in exploration, the head alone and no mark.
 */
export function exploreView(
  mode: ExploreMode,
  head: GraphSnapshot,
  base: GraphSnapshot | null,
  response: DiffResponse | null,
): ExploreView {
  if (mode === 'explore' || !response) return { graph: head, marks: new Map() };
  const graph = base
    ? withBaseOnly(head, base, { ...response, renames: response.renames ?? [] })
    : head;
  return { graph, marks: new Map(response.diff.nodes.map((n) => [n.id, n])) };
}

/** The entry points of a graph by type (routes first), nodes sorted by id. */
export function entryPoints(graph: GraphSnapshot): EntryGroup[] {
  const byType = new Map<string, Node[]>();
  for (const node of graph.nodes) {
    if (!node.entry) continue;
    const type = node.entryType ?? 'main';
    byType.set(type, [...(byType.get(type) ?? []), node]);
  }
  const rank = (type: string) => {
    const i = ENTRY_ORDER.indexOf(type);
    return i < 0 ? ENTRY_ORDER.length : i;
  };
  return [...byType.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([type, nodes]) => ({
      type,
      nodes: [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    }));
}

/** The figures of the overview: detector, packages, externals, files, symbols, links by kind. */
export function overview(response: SnapshotResponse): Overview {
  const count = (kind: Node['kind']) => response.graph.nodes.filter((n) => n.kind === kind).length;
  const links: Record<string, number> = {};
  for (const edge of response.graph.edges) links[edge.kind] = (links[edge.kind] ?? 0) + 1;
  return {
    detector: response.meta.detector,
    packages: count('package'),
    externals: count('external'),
    files: count('file'),
    symbols: count('symbol'),
    links,
  };
}
