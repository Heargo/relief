import { describe, expect, it } from 'vitest';

import type { SnapshotResponse } from '../../../core/models/contract';
import acmeShop from '../../../../testing/fixtures/acme-shop.snapshot.json';
import { layoutCrossings } from './crossings.logic';
import { computeLayouts } from './layout-compute.logic';
import { alphabeticalOrder } from './layout-optimize.logic';
import { layoutGraph } from './layout.logic';

// What the layout worker runs: both layouts of a snapshot, as plain data (structured clone).
// acme-shop with children ordered by id crosses 586 times in total (see layout-optimize spec).
const GRAPH = (acmeShop as unknown as SnapshotResponse).graph;

describe('computeLayouts', () => {
  const layouts = computeLayouts(GRAPH);

  it('gives the raw layout: the nested grid with the children sorted by id', () => {
    expect(layouts.raw).toEqual(layoutGraph(GRAPH, alphabeticalOrder(GRAPH)));
    expect(layoutCrossings(layouts.raw, GRAPH)).toBe(586);
  });

  it('gives an optimized layout that crosses less than the raw one and places every node', () => {
    expect(layoutCrossings(layouts.optimized, GRAPH)).toBeLessThan(586);
    expect([...layouts.optimized.nodes.keys()].sort()).toEqual(
      [...layouts.raw.nodes.keys()].sort(),
    );
  });

  it('survives a structured clone unchanged (it crosses the worker boundary)', () => {
    expect(structuredClone(layouts)).toEqual(layouts);
  });
});
