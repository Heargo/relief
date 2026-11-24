import { describe, expect, it } from 'vitest';

import type { EdgeLine } from '../business/map.business';
import type { EdgeShape } from './edges.logic';
import { buildMapScene, type MapSceneInput } from './map-scene.logic';

// U32, scene seam: `EdgeShape.route` (the points of the route, world units, `null` or absent for
// the direct curve) becomes `SceneEdge.route` (a copy of the points, or `null`).

const ROUTE = [
  { x: 100, y: 150 },
  { x: 150, y: 150 },
  { x: 150, y: 20 },
  { x: 400, y: 20 },
];

const shape = (route?: EdgeShape['route']): EdgeShape => ({
  d: 'M0,0Q5,5 10,10',
  arrow: '',
  mx: 5,
  my: 5,
  covered: false,
  length: 200,
  route,
});

function line(from: string, to: string, route?: EdgeShape['route']): EdgeLine {
  return {
    edge: { from, to, count: 1, kinds: ['imports'], links: [], changed: false },
    shape: shape(route),
    selected: false,
    status: 'unchanged',
    violations: { introduced: 0, existing: 0 },
    added: 0,
    removed: 0,
    moved: 0,
    review: false,
    cls: 'base',
    label: '',
    tooltip: '',
  };
}

function input(edgeLines: EdgeLine[], mergedEdgeLines: EdgeLine[] = []): MapSceneInput {
  return {
    nodes: [],
    edgeLines,
    mergedEdgeLines,
    coChangeLines: [],
    emphasis: { nodes: new Map(), edges: new Map() },
    modesScale: 1,
    info: () => undefined,
    t: (key) => key,
    impact: null,
    reading: null,
    focus: null,
    archi: null,
    risk: null,
    loading: new Set(),
  };
}

describe('buildMapScene, routes', () => {
  it('exposes the points of the route of an edge', () => {
    const [edge] = buildMapScene(input([line('a', 'b', ROUTE)])).edges;
    expect(edge.route).toEqual(ROUTE);
  });

  it('has no route on an edge drawn as its direct curve', () => {
    const edges = buildMapScene(input([line('a', 'b', null), line('c', 'd')])).edges;
    expect(edges.map((e) => e.route)).toEqual([null, null]);
  });

  it('exposes the route of a merged edge too', () => {
    const edges = buildMapScene(input([], [line('a', 'b', ROUTE)])).edges;
    expect(edges[0].route).toEqual(ROUTE);
  });
});
