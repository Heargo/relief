import type { GraphSnapshot } from '../../../core/models/contract';
import { aggregateEdges } from './edges.logic';
import { isLeafKind, type MapLayout } from './layout.logic';
import { levelOfKind } from './visibility.logic';

export interface Segment {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** An aggregated edge, reduced to the ids of its two boxes. */
export type BoxPair = readonly [string, string];

function side(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax));
}

/** Proper crossings between pairs of segments: a shared endpoint or an overlap does not count. */
export function countSegmentCrossings(segments: Segment[]): number {
  let count = 0;
  for (let i = 0; i < segments.length; i++) {
    const { a: p, b: q } = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const { a: r, b: s } = segments[j];
      const o1 = side(p.x, p.y, q.x, q.y, r.x, r.y);
      const o2 = side(p.x, p.y, q.x, q.y, s.x, s.y);
      if (o1 * o2 >= 0) continue;
      const o3 = side(r.x, r.y, s.x, s.y, p.x, p.y);
      const o4 = side(r.x, r.y, s.x, s.y, q.x, q.y);
      if (o3 * o4 < 0) count++;
    }
  }
  return count;
}

/**
 * Boxes of the level: the nodes whose parent is open and that are not open themselves. A
 * container is open from its level on, even without children (it then shows nothing).
 */
function boxesAtLevel(layout: MapLayout, level: number): Set<string> {
  const boxes = new Set<string>();
  const visit = (id: string): void => {
    const node = layout.nodes.get(id);
    if (!node) return;
    if (!isLeafKind(node.kind) && levelOfKind(node.kind) <= level) {
      node.children.forEach(visit);
    } else {
      boxes.add(id);
    }
  };
  layout.roots.forEach(visit);
  return boxes;
}

/** The pairs of boxes joined by at least one edge at this level. They do not depend on the order. */
export function boxPairsAtLevel(layout: MapLayout, graph: GraphSnapshot, level: number): BoxPair[] {
  const parents = new Map(graph.nodes.map((n) => [n.id, n.parent ?? null]));
  const edges = aggregateEdges(graph.edges, parents, boxesAtLevel(layout, level));
  return edges.map((e): BoxPair => [e.from, e.to]);
}

/** Crossings among the center-to-center segments of the pairs, placed by `layout`. */
export function crossingsOfPairs(layout: MapLayout, pairs: readonly BoxPair[]): number {
  const segments: Segment[] = [];
  for (const [from, to] of pairs) {
    const a = layout.nodes.get(from);
    const b = layout.nodes.get(to);
    if (!a || !b) continue;
    segments.push({
      a: { x: a.x + a.w / 2, y: a.y + a.h / 2 },
      b: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    });
  }
  return countSegmentCrossings(segments);
}

/** Crossings of the aggregated edges when the map is open down to `level` (0 to 3). */
export function crossingsAtLevel(layout: MapLayout, graph: GraphSnapshot, level: number): number {
  return crossingsOfPairs(layout, boxPairsAtLevel(layout, graph, level));
}

/** Sum of the crossings at the module, file and symbol levels. */
export function layoutCrossings(layout: MapLayout, graph: GraphSnapshot): number {
  return [1, 2, 3].reduce((sum, level) => sum + crossingsAtLevel(layout, graph, level), 0);
}
