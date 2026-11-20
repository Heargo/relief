import type { GraphSnapshot } from '../../../core/models/contract';
import type { DiffResponse } from '../../../core/models/contract';
import { ancestorIds, mergeExpanded } from '../../map/helpers/subgraph.logic';

/**
 * The graph of the review: the subgraph of the diff, with the containers the user opened. A closed
 * container of `subgraph` that `head` (the map's own graph, which holds what was opened on demand)
 * has opened gets its children.
 */
export function reviewGraph(subgraph: GraphSnapshot, head: GraphSnapshot): GraphSnapshot {
  const headNodes = new Map(head.nodes.map((n) => [n.id, n]));
  const isOpened = (id: string) => {
    const opened = headNodes.get(id);
    return !!opened && !opened.childCount;
  };
  let graph = subgraph;
  // Containers to open; the children an opening brings are queued in their turn.
  const queue = graph.nodes.filter((n) => n.childCount && isOpened(n.id)).map((n) => n.id);
  const queued = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    const before = new Set(graph.nodes.map((n) => n.id));
    graph = mergeExpanded(graph, id, head);
    for (const n of graph.nodes) {
      if (before.has(n.id) || queued.has(n.id) || !n.childCount || !isOpened(n.id)) continue;
      queued.add(n.id);
      queue.push(n.id);
    }
  }
  return graph;
}

/** The containers to open in the base graph to reach what the diff removed, moved or modified. */
export function baseContainers(response: DiffResponse): string[] {
  const ids = new Set<string>();
  for (const change of response.diff.nodes) {
    if (change.status === 'added') continue;
    for (const id of ancestorIds(change.id)) ids.add(id);
    if (change.status === 'moved') for (const id of ancestorIds(change.from)) ids.add(id);
  }
  return [...ids];
}

/** The graph has closed containers: it is a subgraph of the repository. */
export function isPartial(graph: GraphSnapshot): boolean {
  return graph.nodes.some((n) => !!n.childCount);
}
