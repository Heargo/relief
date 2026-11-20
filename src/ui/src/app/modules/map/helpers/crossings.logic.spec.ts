import { describe, expect, it } from 'vitest';

import type { Edge, GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import {
  countSegmentCrossings,
  crossingsAtLevel,
  layoutCrossings,
  type Segment,
} from './crossings.logic';
import type { LaidOutNode, MapLayout } from './layout.logic';

function seg(ax: number, ay: number, bx: number, by: number): Segment {
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

describe('countSegmentCrossings', () => {
  it('counts nothing for no segment or a single one', () => {
    expect(countSegmentCrossings([])).toBe(0);
    expect(countSegmentCrossings([seg(0, 0, 10, 10)])).toBe(0);
  });

  it('counts an X as one crossing', () => {
    expect(countSegmentCrossings([seg(0, 0, 10, 10), seg(0, 10, 10, 0)])).toBe(1);
  });

  it('does not count parallel or disjoint segments', () => {
    expect(countSegmentCrossings([seg(0, 0, 10, 0), seg(0, 5, 10, 5)])).toBe(0);
    expect(countSegmentCrossings([seg(0, 0, 4, 4), seg(6, 6, 10, 0)])).toBe(0);
  });

  it('does not count segments that only share an endpoint', () => {
    expect(countSegmentCrossings([seg(0, 0, 10, 10), seg(0, 0, 10, 0), seg(10, 10, 0, 20)])).toBe(
      0,
    );
  });

  it('counts every crossing pair: three mutually crossing segments make three', () => {
    // two horizontals-ish lines crossed by a vertical one, and crossing each other
    expect(countSegmentCrossings([seg(0, 0, 10, 10), seg(0, 10, 10, 0), seg(5, -5, 5, 15)])).toBe(
      3,
    );
  });
});

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

function call(from: string, to: string): Edge {
  return { from, to, kind: 'imports', precision: 'resolved' };
}

function laid(
  id: string,
  kind: NodeKind,
  parent: string | null,
  children: string[],
  x: number,
  y: number,
  w: number,
  h: number,
): [string, LaidOutNode] {
  return [id, { id, kind, parent, children, x, y, w, h }];
}

// Two services side by side, two files each. Centres of the files:
//   a1 (15,15)   b1 (215,15)
//   a2 (15,65)   b2 (215,65)
const A = 'pkg:a';
const B = 'pkg:b';
const A1 = `${A}::file:1.ts`;
const A2 = `${A}::file:2.ts`;
const B1 = `${B}::file:1.ts`;
const B2 = `${B}::file:2.ts`;

const LAYOUT: MapLayout = {
  nodes: new Map([
    laid(A, 'service', null, [A1, A2], 0, 0, 100, 100),
    laid(A1, 'file', A, [], 10, 10, 10, 10),
    laid(A2, 'file', A, [], 10, 60, 10, 10),
    laid(B, 'service', null, [B1, B2], 200, 0, 100, 100),
    laid(B1, 'file', B, [], 210, 10, 10, 10),
    laid(B2, 'file', B, [], 210, 60, 10, 10),
  ]),
  roots: [A, B],
  bounds: { x: 0, y: 0, w: 300, h: 100 },
};

function graph(edges: Edge[]): GraphSnapshot {
  return {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges,
    nodes: [
      node('pkg:acme', 'repo', null),
      node(A, 'service', 'pkg:acme'),
      node(A1, 'file', A),
      node(A2, 'file', A),
      node(B, 'service', 'pkg:acme'),
      node(B1, 'file', B),
      node(B2, 'file', B),
    ],
  };
}

describe('crossingsAtLevel', () => {
  // a1 -> b2 and a2 -> b1 swap sides: they cross between the two services.
  const crossed = graph([call(A1, B2), call(A2, B1)]);
  const parallel = graph([call(A1, B1), call(A2, B2)]);

  it('counts the crossing of the file-to-file edges once the services are open (levels 1 and 2)', () => {
    expect(crossingsAtLevel(LAYOUT, crossed, 1)).toBe(1);
    expect(crossingsAtLevel(LAYOUT, crossed, 2)).toBe(1);
  });

  it('merges the edges per pair of boxes at level 0: two services joined by one edge cross nothing', () => {
    expect(crossingsAtLevel(LAYOUT, crossed, 0)).toBe(0);
  });

  it('counts no crossing for edges that do not swap', () => {
    expect(crossingsAtLevel(LAYOUT, parallel, 1)).toBe(0);
    expect(crossingsAtLevel(LAYOUT, parallel, 2)).toBe(0);
  });

  it('ignores edges internal to a box and edges between a box and its descendants', () => {
    const internal = graph([call(A1, A2), call(A, A1), call(B2, B1)]);
    expect(crossingsAtLevel(LAYOUT, internal, 1)).toBe(0);
  });
});

describe('layoutCrossings', () => {
  it('sums the crossings of levels 1, 2 and 3', () => {
    // 1 at level 1, 1 at level 2, 0 at level 3 (files are the deepest boxes, there is no symbol)
    expect(layoutCrossings(LAYOUT, graph([call(A1, B2), call(A2, B1)]))).toBe(2);
    expect(layoutCrossings(LAYOUT, graph([call(A1, B1), call(A2, B2)]))).toBe(0);
  });
});
