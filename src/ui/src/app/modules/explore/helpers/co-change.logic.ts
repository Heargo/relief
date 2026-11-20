import type { CoChangePair, Edge, Node } from '../../../core/models/contract';

export type { CoChangePair };

const FILE_MARK = '::file:';

/** The file nodes by repository path (a file id contains `::file:<path>`). */
function filesByPath(nodes: readonly Node[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind !== 'file') continue;
    const at = node.id.indexOf(FILE_MARK);
    if (at >= 0) files.set(node.id.slice(at + FILE_MARK.length), node.id);
  }
  return files;
}

/** One `co_change` edge per pair of files, between their file nodes; pairs off the map are dropped. */
export function coChangeEdges(pairs: readonly CoChangePair[], nodes: readonly Node[]): Edge[] {
  const files = filesByPath(nodes);
  const edges: Edge[] = [];
  for (const { a, b } of pairs) {
    const from = files.get(a);
    const to = files.get(b);
    if (from && to) edges.push({ from, to, kind: 'co_change', precision: 'resolved' });
  }
  return edges;
}
