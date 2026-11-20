import type { GraphSnapshot } from '../../../core/models/contract';

/**
 * The nodes that stay sharp in the PR focus layer: the changed nodes, their neighbours at one hop
 * (edges followed in both directions) and the boxes that contain any of them. Null when nothing
 * changed: nothing is faded then.
 */
export function focusSet(
  graph: GraphSnapshot,
  changedIds: readonly [string, ...string[]],
): Set<string>;
export function focusSet(graph: GraphSnapshot, changedIds: readonly string[]): Set<string> | null;
export function focusSet(graph: GraphSnapshot, changedIds: readonly string[]): Set<string> | null {
  if (changedIds.length === 0) return null;
  const seeds = new Set(changedIds);
  const result = new Set<string>(seeds);
  for (const edge of graph.edges) {
    if (seeds.has(edge.from)) result.add(edge.to);
    if (seeds.has(edge.to)) result.add(edge.from);
  }
  const parents = new Map(graph.nodes.map((n) => [n.id, n.parent ?? null]));
  for (const id of [...result]) {
    for (let up = parents.get(id) ?? null; up && !result.has(up); up = parents.get(up) ?? null) {
      result.add(up);
    }
  }
  return result;
}
