import { describe, expect, it } from 'vitest';

import type { VisibleNode } from '../business/map.business';
import { buildMapScene, type MapSceneInput } from './map-scene.logic';

// R18: `MapSceneInput.repeated?: { counts: ReadonlyMap<string, number>; faded: ReadonlySet<string> }`
// (what `repeatedNodes` returns); `SceneNode.repeated: { count: number } | null` on the
// representative ("×N identical"), `SceneNode.faded` true on the other members.
const REP = 'pkg:a::file:src/f1.ts';
const MEMBER = 'pkg:a::file:src/f2.ts';
const OTHER = 'pkg:a::file:src/f5.ts';

const vnode = (id: string): VisibleNode => ({
  id,
  kind: 'file',
  mode: 'box',
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  mark: null,
});

function scene(over: Partial<MapSceneInput>) {
  return buildMapScene({
    nodes: [vnode(REP), vnode(MEMBER), vnode(OTHER)],
    edgeLines: [],
    mergedEdgeLines: [],
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
    ...over,
  });
}

const repeated = {
  counts: new Map([[REP, 4]]),
  faded: new Set([MEMBER]),
};

describe('buildMapScene, repeated changes', () => {
  it('puts "×N" on the representative, normal', () => {
    const node = scene({ repeated }).nodes.find((n) => n.id === REP);

    expect(node?.repeated).toEqual({ count: 4 });
    expect(node?.faded).toBe(false);
  });

  it('fades the other members, without a count', () => {
    const node = scene({ repeated }).nodes.find((n) => n.id === MEMBER);

    expect(node?.repeated).toBeNull();
    expect(node?.faded).toBe(true);
  });

  it('leaves the other files alone, and every node alone without groups', () => {
    const nodes = scene({ repeated }).nodes;
    expect(nodes.find((n) => n.id === OTHER)).toMatchObject({ repeated: null, faded: false });

    for (const node of scene({}).nodes)
      expect(node).toMatchObject({ repeated: null, faded: false });
  });

  it('keeps the fade of the focus on the representative', () => {
    const node = scene({ repeated, focus: new Set([MEMBER]) }).nodes.find((n) => n.id === REP);

    expect(node?.faded).toBe(true);
    expect(node?.repeated).toEqual({ count: 4 });
  });
});
