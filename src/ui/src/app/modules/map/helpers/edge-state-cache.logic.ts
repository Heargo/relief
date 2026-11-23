import type { AggregatedEdge } from './edges.logic';
import { edgeState, type EdgeState, type EdgeStateContext } from './edge-state.logic';

export interface EdgeStateCache {
  get(edge: AggregatedEdge): EdgeState;
  /** The state is already made: `get` costs nothing. */
  has(edge: AggregatedEdge): boolean;
}

const sameLinks = (a: AggregatedEdge['links'], b: AggregatedEdge['links']): boolean =>
  a === b || (a.length === b.length && a.every((link, i) => link === b[i]));

/** The state of each directed pair, kept while the pair aggregates the same links. */
export function createEdgeStateCache(context: EdgeStateContext): EdgeStateCache {
  // An edge object is never mutated: asked again as is, it needs no look at its links.
  const byEdge = new WeakMap<AggregatedEdge, EdgeState>();
  const kept = new Map<string, { links: AggregatedEdge['links']; state: EdgeState }>();
  return {
    has(edge) {
      if (byEdge.has(edge)) return true;
      const hit = kept.get(`${edge.from}\u0000${edge.to}`);
      return hit !== undefined && sameLinks(hit.links, edge.links);
    },
    get(edge) {
      const seen = byEdge.get(edge);
      if (seen) return seen;
      const key = `${edge.from}\u0000${edge.to}`;
      const hit = kept.get(key);
      if (hit && sameLinks(hit.links, edge.links)) {
        byEdge.set(edge, hit.state);
        return hit.state;
      }
      const state = edgeState(edge, context);
      kept.set(key, { links: edge.links, state });
      byEdge.set(edge, state);
      return state;
    },
  };
}
