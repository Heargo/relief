import type { GraphSnapshot } from '../../../core/models/contract';
import { layoutCrossings } from './crossings.logic';
import { alphabeticalOrder, optimizeOrder } from './layout-optimize.logic';
import { layoutGraph, type MapLayout } from './layout.logic';

export interface Layouts {
  optimized: MapLayout;
  raw: MapLayout;
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
  return { optimized, raw: layoutGraph(graph, alphabeticalOrder(graph)) };
}
