import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from './map.business';

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const API = 'pkg:@acme/api';
const GRAPH: GraphSnapshot = {
  commit: '1'.repeat(40),
  edges: [],
  nodes: [
    node('pkg:acme', 'repo', null),
    node(API, 'service', 'pkg:acme'),
    node(`${API}::file:a.ts`, 'file', API),
    node(`${API}::file:b.ts`, 'file', API),
  ],
};
const GROWN: GraphSnapshot = {
  ...GRAPH,
  nodes: [
    ...GRAPH.nodes,
    ...Array.from({ length: 8 }, (_, i) => node(`${API}::file:more${i}.ts`, 'file', API)),
  ],
};

describe('MapBusiness.show keeping the view', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    TestBed.configureTestingModule({
      providers: [MapBusiness, { provide: ReliefApiService, useValue: {} }],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('aims at the forced level again on the new layout when the bounds change', () => {
    const map = TestBed.inject(MapBusiness);
    map.setViewport(1000, 600);
    map.show(GRAPH);
    map.setLevel(2);
    vi.advanceTimersByTime(1000);
    const before = map.camera();

    map.show(GROWN, true);
    vi.advanceTimersByTime(1000);
    expect(map.level()).toBe(2);
    expect(map.camera()).not.toEqual(before);
  });

  it('leaves the camera alone when the bounds do not change', () => {
    const map = TestBed.inject(MapBusiness);
    map.setViewport(1000, 600);
    map.show(GRAPH);
    map.setLevel(2);
    vi.advanceTimersByTime(1000);
    const before = map.camera();

    map.show(GRAPH, true);
    vi.advanceTimersByTime(1000);
    expect(map.camera()).toEqual(before);
  });
});
