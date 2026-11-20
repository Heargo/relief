import type { Edge } from '../../../core/models/contract';
import { type AggregatedEdge, isAncestor, visibleAncestor } from './edges.logic';

export interface NodeEdges {
  dependsOn: AggregatedEdge[];
  usedBy: AggregatedEdge[];
}

/** The edges of a node at the displayed level: those it starts (depends on) and those it ends. */
export function nodeEdges(edges: readonly AggregatedEdge[], id: string): NodeEdges {
  return {
    dependsOn: edges.filter((e) => e.from === id),
    usedBy: edges.filter((e) => e.to === id),
  };
}

/** The ancestors of a node, root first, the node itself last. */
function chainOf(id: string, parents: Map<string, string | null>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  for (let cur: string | null | undefined = id; cur && !seen.has(cur); cur = parents.get(cur)) {
    chain.unshift(cur);
    seen.add(cur);
  }
  return chain;
}

/**
 * The edges of a node, its descendants folded into it. The other end is the box shown on the map;
 * when that box holds the node (a map not zoomed in yet), it is the sibling branch where the two
 * ends part, so that the edge exists at the node's own level.
 */
export function edgesAround(
  links: readonly Edge[],
  parents: Map<string, string | null>,
  visible: Set<string>,
  id: string,
  changed?: (edge: Edge) => boolean,
): AggregatedEdge[] {
  const mine = new Set(chainOf(id, parents));
  const within = (n: string) => n === id || isAncestor(id, n, parents);
  const other = (n: string): string => {
    const shown = visibleAncestor(n, parents, visible);
    if (shown && !mine.has(shown)) return shown;
    return chainOf(n, parents).find((c) => !mine.has(c)) ?? n;
  };
  const pairs = new Map<string, AggregatedEdge>();
  for (const link of links) {
    const out = within(link.from);
    if (out === within(link.to)) continue;
    const from = out ? id : other(link.from);
    const to = out ? other(link.to) : id;
    if (from === to) continue;
    const key = `${from}\u0000${to}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = { from, to, count: 0, kinds: [], links: [], changed: false };
      pairs.set(key, pair);
    }
    pair.count++;
    pair.links.push(link);
    if (!pair.kinds.includes(link.kind)) pair.kinds.push(link.kind);
    if (changed?.(link)) pair.changed = true;
  }
  return [...pairs.values()];
}
