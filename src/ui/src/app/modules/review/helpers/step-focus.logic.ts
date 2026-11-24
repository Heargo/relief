import type { GraphSnapshot } from '../../../core/models/contract';
import { edgeKey } from '../../map/helpers/emphasis.logic';

/**
 * Step-by-step reading: what stays sharp around the current element.
 * - `nodes`: the element, its direct neighbours (edges followed in both directions) and the boxes
 *   holding them;
 * - `edges`: `edgeKey` of the edges whose two ends are the element or one of its neighbours;
 * - `elements`: the element and its neighbours alone, without their boxes (the map may show them
 *   opened into symbols, which stay as sharp as they are).
 * Edges are taken as the snapshot gives them, plus their version lifted to the element's level;
 * the scene aggregates them up to the boxes it draws.
 */
export function stepFocus(
  graph: GraphSnapshot,
  current: string,
): { nodes: Set<string>; edges: Set<string>; elements: Set<string> } {
  const links = elementEdges(graph, current);
  const near = new Set<string>([current]);
  for (const { from, to } of links) {
    if (from === current) near.add(to);
    if (to === current) near.add(from);
  }
  const edges = new Set<string>();
  for (const { from, to } of links) {
    if (near.has(from) && near.has(to)) edges.add(edgeKey(from, to));
  }
  const nodes = new Set(near);
  const parents = new Map(graph.nodes.map((n) => [n.id, n.parent ?? null]));
  for (const id of [...near]) {
    for (let up = parents.get(id) ?? null; up && !nodes.has(up); up = parents.get(up) ?? null) {
      nodes.add(up);
    }
  }
  return { nodes, edges, elements: near };
}

/**
 * The edges of the graph, plus each of them seen at the level of `current` (an edge between
 * symbols also counts between their files when the current element is a file): the map draws
 * edges at the level of what is open, which is not always the level of the snapshot.
 */
export function elementEdges(
  graph: GraphSnapshot,
  current: string,
): { from: string; to: string }[] {
  const depth = current.split('::').length;
  const lift = (id: string): string => {
    const parts = id.split('::');
    return parts.length > depth ? parts.slice(0, depth).join('::') : id;
  };
  const links = new Map<string, { from: string; to: string }>();
  for (const { from, to } of graph.edges) {
    links.set(edgeKey(from, to), { from, to });
    const [a, b] = [lift(from), lift(to)];
    if (a !== b) links.set(edgeKey(a, b), { from: a, to: b });
  }
  return [...links.values()];
}
