import { describe, expect, it } from 'vitest';

import type { VisibleNode } from '../business/map.business';
import { edgeKey } from './emphasis.logic';
import { buildMapScene, edgeFaded } from './map-scene.logic';

// R19: the map opens the selected entry into symbols; the step focus is at the level of the entry
// (`elements` = the entry and its neighbours, `edges` = `edgeKey` between them). What lies inside
// an element is as sharp as the element.
const CUR = 'pkg:a::file:src/discount.ts';
const NEIGHBOUR = 'pkg:a::file:src/invoice.ts';
const FAR = 'pkg:a::file:src/far.ts';
const sym = (file: string, name: string) => `${file}::sym:${name}`;

const input = {
  stepEdges: new Set([edgeKey(NEIGHBOUR, CUR)]),
  stepElements: new Set([CUR, NEIGHBOUR]),
};

describe('step focus on opened elements', () => {
  it('keeps the edges between symbols of the current element and of its neighbours', () => {
    expect(edgeFaded(sym(CUR, 'apply'), sym(CUR, 'Code'), input)).toBe(false);
    expect(edgeFaded(sym(NEIGHBOUR, 'total'), sym(CUR, 'apply'), input)).toBe(false);
    expect(edgeFaded(NEIGHBOUR, sym(CUR, 'apply'), input)).toBe(false);
  });

  it('fades the edges that leave the neighbourhood', () => {
    expect(edgeFaded(sym(NEIGHBOUR, 'total'), sym(FAR, 'x'), input)).toBe(true);
    expect(edgeFaded(sym(CUR, 'apply'), FAR, input)).toBe(true);
  });

  it('keeps the symbols inside the current element and its neighbours', () => {
    const node = (id: string): VisibleNode => ({
      id,
      kind: 'symbol',
      mode: 'box',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      mark: null,
    });
    const scene = buildMapScene({
      nodes: [node(sym(CUR, 'Code')), node(sym(NEIGHBOUR, 'total')), node(sym(FAR, 'x'))],
      edgeLines: [],
      mergedEdgeLines: [],
      coChangeLines: [],
      emphasis: { nodes: new Map(), edges: new Map() },
      modesScale: 1,
      info: () => undefined,
      t: (key) => key,
      impact: null,
      reading: null,
      focus: new Set([CUR, NEIGHBOUR]),
      ...input,
      archi: null,
      risk: null,
      loading: new Set(),
    });
    expect(scene.nodes.map((n) => n.faded)).toEqual([false, false, true]);
  });
});
