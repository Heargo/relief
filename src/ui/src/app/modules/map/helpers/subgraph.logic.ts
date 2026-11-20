import type { Edge, GraphSnapshot, Node } from '../../../core/models/contract';

/** A box on screen, in pixels. */
export interface ScreenBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The focused node when it is a container whose direct children are not all in the graph. */
export function containerToLoad(graph: GraphSnapshot, focusId: string | null): string | null {
  if (focusId === null) return null;
  const node = graph.nodes.find((n) => n.id === focusId);
  if (!node?.childCount) return null;
  const present = graph.nodes.filter((n) => n.parent === focusId).length;
  return node.childCount > present ? focusId : null;
}

/**
 * The box the user zooms into: the smallest of the boxes that hold `point` and that `isClosed`
 * says are not loaded.
 */
export function zoomedBox(
  boxes: readonly ScreenBox[],
  point: { x: number; y: number },
  isClosed: (id: string) => boolean,
): string | null {
  let best: ScreenBox | null = null;
  for (const box of boxes) {
    if (point.x < box.x || point.x > box.x + box.w) continue;
    if (point.y < box.y || point.y > box.y + box.h) continue;
    if (best && best.w * best.h <= box.w * box.h) continue;
    if (isClosed(box.id)) best = box;
  }
  return best?.id ?? null;
}

/** The ids that hold a node, outermost first: what to expand to reach it. */
export function ancestorIds(id: string): string[] {
  const parts = id.split('::');
  const ids: string[] = [];
  const [first = '', ...rest] = parts;
  const segments = first.split('/');
  // A scoped package name (`@scope/name`) is one unit: `pkg:@scope` is not a node.
  const scoped = segments[0]?.startsWith('pkg:@') ?? false;
  for (let i = scoped ? 2 : 1; i < segments.length; i++) ids.push(segments.slice(0, i).join('/'));
  let current = first;
  if (parts.length > 1) ids.push(first);
  for (const part of rest.slice(0, -1)) {
    current = `${current}::${part}`;
    ids.push(current);
  }
  return ids;
}

/**
 * `graph` with a container opened by `loaded`, the snapshot that answered `expand: [containerId]`:
 * its children are added, its `childCount` dropped and the edges touching it replaced by the ones
 * of `loaded`. The input is not mutated.
 */
export function mergeExpanded(
  graph: GraphSnapshot,
  containerId: string,
  loaded: GraphSnapshot,
): GraphSnapshot {
  const known = new Set(graph.nodes.map((n) => n.id));
  const added = loaded.nodes.filter((n) => n.parent === containerId && !known.has(n.id));
  const nodes = [
    ...graph.nodes.map((n) => (n.id === containerId ? withoutChildCount(n) : n)),
    ...added,
  ];
  const parents = new Map(nodes.map((n) => [n.id, n.parent ?? null]));
  const inside = (id: string): boolean => {
    for (let at: string | null = id; at !== null; at = parents.get(at) ?? null) {
      if (at === containerId) return true;
    }
    return false;
  };
  const touching = (e: Edge) => inside(e.from) || inside(e.to);
  const edges = [
    ...graph.edges.filter((e) => !touching(e)),
    ...loaded.edges.filter((e) => touching(e) && parents.has(e.from) && parents.has(e.to)),
  ];
  return { ...graph, nodes, edges };
}

function withoutChildCount(node: Node): Node {
  const { childCount: _dropped, ...rest } = node;
  return rest;
}
