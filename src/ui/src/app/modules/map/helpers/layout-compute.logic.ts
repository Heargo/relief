import type { GraphSnapshot } from '../../../core/models/contract';
import { buildCorridors, type Corridors } from './edge-routing.logic';
import { layoutCrossings } from './crossings.logic';
import { alphabeticalOrder, optimizeOrder } from './layout-optimize.logic';
import { layoutGraph, type MapLayout } from './layout.logic';

export interface Layouts {
  optimized: MapLayout;
  raw: MapLayout;
  /** The corridors of each layout, for the edge routes (made here, at rest, off the main thread). */
  corridors: { optimized: Corridors; raw: Corridors };
}

/**
 * Both layouts of a graph, as plain data (it crosses the worker boundary). "Fewer crossings" is the
 * best of the searched order and the order of the snapshot, so it is never worse than the natural
 * one (and keeps it when nothing crosses).
 */
export function computeLayouts(graph: GraphSnapshot): Layouts {
  const searched = layoutGraph(graph, optimizeOrder(graph).order);
  const natural = layoutGraph(graph);
  const optimized =
    layoutCrossings(searched, graph) < layoutCrossings(natural, graph) ? searched : natural;
  const raw = layoutGraph(graph, alphabeticalOrder(graph));
  return {
    optimized,
    raw,
    corridors: { optimized: buildCorridors(optimized), raw: buildCorridors(raw) },
  };
}
