import { describe, expect, it } from 'vitest';

import type { Edge, GraphSnapshot, Node } from '../../../core/models/contract';
import { ancestorIds, containerToLoad, mergeExpanded, zoomedBox } from './subgraph.logic';

// Contract with the core (ticket S01): a closed container carries `childCount` (its direct
// children in the full graph) and has no child in the graph; an edge between two containers that
// stands for several real edges carries `count`.
//
// API expected:
//   containerToLoad(graph, focusId): string | null   - the focused node when it is a closed
//     container (childCount > 0 and no child in the graph), else null;
//   mergeExpanded(graph, containerId, loaded): GraphSnapshot - `loaded` is the snapshot answering
//     `expand: [containerId]`; the result is `graph` with the container open (childCount dropped),
//     its children added (with their own childCount), and every edge touching the container
//     replaced by the edges of `loaded`; the input graph is not mutated.

function node(id: string, kind: Node['kind'], parent: string | null, childCount?: number): Node {
  return {
    id,
    kind,
    subkind: '',
    parent,
    visibility: 'public',
    contentHash: '',
    ...(childCount === undefined ? {} : { childCount }),
  } as Node;
}

function edge(from: string, to: string, count?: number): Edge {
  return { from, to, kind: 'imports', precision: 'resolved', ...(count ? { count } : {}) } as Edge;
}

const REPO = 'pkg:wide';
const A = 'pkg:a';
const B = 'pkg:b';
const A_FILE1 = 'pkg:a::file:one.ts';
const A_FILE2 = 'pkg:a::file:two.ts';

function closed(): GraphSnapshot {
  return {
    commit: 'c1',
    nodes: [node(REPO, 'repo', null), node(A, 'module', REPO, 2), node(B, 'module', REPO, 40)],
    edges: [edge(A, B, 7)],
  };
}

function loaded(): GraphSnapshot {
  return {
    commit: 'c1',
    nodes: [
      node(A, 'module', REPO),
      node(A_FILE1, 'file', A, 3),
      node(A_FILE2, 'file', A, 1),
      node(B, 'module', REPO, 40),
    ],
    edges: [edge(A_FILE1, B, 4), edge(A_FILE2, B, 3)],
  };
}

describe('containerToLoad', () => {
  it('returns the focused container when it is closed', () => {
    expect(containerToLoad(closed(), A)).toBe(A);
  });

  it('returns null for a container that already has its children', () => {
    expect(containerToLoad(mergeExpanded(closed(), A, loaded()), A)).toBeNull();
  });

  it('returns null for a node without children (a symbol) and for an unknown node', () => {
    const graph = mergeExpanded(closed(), A, loaded());
    expect(containerToLoad(graph, REPO)).toBeNull();
    expect(containerToLoad(graph, 'pkg:nowhere')).toBeNull();
  });

  it('returns null for a node that is not focused on anything', () => {
    expect(containerToLoad(closed(), null)).toBeNull();
  });
});

describe('mergeExpanded', () => {
  it('opens the container: its children appear and its childCount is dropped', () => {
    const merged = mergeExpanded(closed(), A, loaded());
    const ids = merged.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([A, A_FILE1, A_FILE2, B, REPO].sort());
    const a = merged.nodes.find((n) => n.id === A);
    expect(a?.childCount).toBeUndefined();
  });

  it('keeps the count of the loaded children and of the other closed containers', () => {
    const merged = mergeExpanded(closed(), A, loaded());
    expect(merged.nodes.find((n) => n.id === A_FILE1)?.childCount).toBe(3);
    expect(merged.nodes.find((n) => n.id === B)?.childCount).toBe(40);
  });

  it('replaces the aggregated edge of the container by the edges of the loaded content', () => {
    const merged = mergeExpanded(closed(), A, loaded());
    expect(merged.edges).toEqual([edge(A_FILE1, B, 4), edge(A_FILE2, B, 3)]);
  });

  it('keeps the edges that do not touch the container', () => {
    const graph = closed();
    graph.edges.push(edge(B, REPO, 2));
    const merged = mergeExpanded(graph, A, loaded());
    expect(merged.edges).toContainEqual(edge(B, REPO, 2));
    expect(merged.edges).not.toContainEqual(edge(A, B, 7));
  });

  it('does not mutate the graph it merges into', () => {
    const graph = closed();
    mergeExpanded(graph, A, loaded());
    expect(graph).toEqual(closed());
  });

  it('merging the same content twice gives the same graph', () => {
    const once = mergeExpanded(closed(), A, loaded());
    expect(mergeExpanded(once, A, loaded())).toEqual(once);
  });
});

describe('zoomedBox', () => {
  const boxes = [
    { id: 'big', x: 0, y: 0, w: 1000, h: 600 },
    { id: 'mid', x: 100, y: 100, w: 400, h: 300 },
    { id: 'small', x: 150, y: 150, w: 100, h: 50 },
    { id: 'far', x: 800, y: 100, w: 100, h: 100 },
  ];
  const all = () => true;

  it('returns the smallest closed box under the point', () => {
    expect(zoomedBox(boxes, { x: 160, y: 160 }, all)).toBe('small');
  });

  it('ignores the boxes that are already loaded, even when they are smaller', () => {
    expect(zoomedBox(boxes, { x: 160, y: 160 }, (id) => id !== 'small')).toBe('mid');
    expect(zoomedBox(boxes, { x: 160, y: 160 }, (id) => id === 'big')).toBe('big');
  });

  it('returns null when no closed box holds the point', () => {
    expect(zoomedBox(boxes, { x: 160, y: 160 }, () => false)).toBeNull();
    expect(zoomedBox(boxes, { x: 1500, y: 900 }, all)).toBeNull();
    expect(zoomedBox([], { x: 1, y: 1 }, all)).toBeNull();
  });

  it('does not pick a box beside the point', () => {
    expect(zoomedBox(boxes, { x: 850, y: 150 }, (id) => id === 'far' || id === 'mid')).toBe('far');
    expect(zoomedBox(boxes, { x: 700, y: 150 }, (id) => id === 'far')).toBeNull();
  });
});

describe('ancestorIds', () => {
  it('lists the containers of a symbol in a scoped package, outermost first, never `pkg:@acme`', () => {
    expect(
      ancestorIds('pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:computeTotal'),
    ).toEqual([
      'pkg:@acme/api',
      'pkg:@acme/api/billing',
      'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts',
    ]);
  });

  it('gives `pkg:@acme/api` for a file of the scoped package itself', () => {
    expect(ancestorIds('pkg:@acme/api::file:apps/api/package.json')).toEqual(['pkg:@acme/api']);
    expect(ancestorIds('pkg:@acme/api::file:apps/api/a.ts::sym:f')).toEqual([
      'pkg:@acme/api',
      'pkg:@acme/api::file:apps/api/a.ts',
    ]);
  });

  it('lists the folders of an unscoped package, then its file', () => {
    expect(
      ancestorIds('pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts::sym:f7x42'),
    ).toEqual([
      'pkg:wide',
      'pkg:wide/packages',
      'pkg:wide/packages/pkg-07',
      'pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts',
    ]);
    expect(ancestorIds('pkg:wide/packages/pkg-07')).toEqual(['pkg:wide', 'pkg:wide/packages']);
  });
});
