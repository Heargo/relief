import { describe, expect, it } from 'vitest';

import type { SnapshotResponse } from '../../../core/models/contract';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { buildCorridors, routeEdge } from './edge-routing.logic';
import { computeLayouts } from './layout-compute.logic';

// U32, worker seam: what the layout worker runs also computes the corridors of each layout
// (`Layouts.corridors.optimized` / `.raw`, the `buildCorridors` of the layout of the same name),
// so that the routes are made at rest, once, off the main thread.
const GRAPH = (acmeShop as unknown as SnapshotResponse).graph;

describe('computeLayouts, corridors', () => {
  const layouts = computeLayouts(GRAPH);

  it('gives the corridors of the optimized and of the raw layout', () => {
    expect(layouts.corridors.optimized).toEqual(buildCorridors(layouts.optimized));
    expect(layouts.corridors.raw).toEqual(buildCorridors(layouts.raw));
  });

  it('survives a structured clone, and the clone still routes', () => {
    const cloned = structuredClone(layouts);
    expect(cloned.corridors).toEqual(layouts.corridors);
    const edge = GRAPH.edges.find(
      (e) => layouts.optimized.nodes.has(e.from) && layouts.optimized.nodes.has(e.to),
    )!;
    expect(routeEdge(cloned.corridors.optimized, edge.from, edge.to)).toEqual(
      routeEdge(layouts.corridors.optimized, edge.from, edge.to),
    );
  });
});
