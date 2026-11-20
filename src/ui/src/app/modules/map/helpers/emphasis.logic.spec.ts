import { describe, expect, it } from 'vitest';

import type { AggregatedEdge } from './edges.logic';
import { edgeEmphasis, edgeKey, nodeEmphasis, type Selection } from './emphasis.logic';

function agg(from: string, to: string): AggregatedEdge {
  return { from, to, count: 1, kinds: ['calls'], links: [], changed: false };
}

const WEB = 'pkg:@acme/web';
const API = 'pkg:@acme/api';
const DB = 'pkg:@acme/db';
const UI = 'pkg:@acme/ui';
const WEB_SYM = `${WEB}::file:a.ts::sym:a`;

const EDGES = [agg(WEB, API), agg(API, DB), agg(UI, WEB), agg(UI, DB)];
const identity = (id: string): string | null => id;
const node = (id: string): Selection => ({ kind: 'node', id });

describe('edgeEmphasis', () => {
  it('leaves every edge normal without a selection', () => {
    const result = edgeEmphasis(EDGES, null, identity);
    expect([...result.values()]).toEqual(['normal', 'normal', 'normal', 'normal']);
    expect(result.get(edgeKey(WEB, API))).toBe('normal');
  });

  it('marks the outgoing edges of the selected node out, the incoming in, the others dim', () => {
    const result = edgeEmphasis(EDGES, node(API), identity);
    expect(result.get(edgeKey(API, DB))).toBe('out');
    expect(result.get(edgeKey(WEB, API))).toBe('in');
    expect(result.get(edgeKey(UI, WEB))).toBe('dim');
    expect(result.get(edgeKey(UI, DB))).toBe('dim');
    expect(result.size).toBe(4);
  });

  it('treats an aggregated edge as incident through the first visible ancestor of the node', () => {
    const visibleOf = (id: string) => (id === WEB_SYM ? WEB : id);
    const result = edgeEmphasis(EDGES, node(WEB_SYM), visibleOf);
    expect(result.get(edgeKey(WEB, API))).toBe('out');
    expect(result.get(edgeKey(UI, WEB))).toBe('in');
    expect(result.get(edgeKey(API, DB))).toBe('dim');
  });

  it('marks only the picked edge when an edge is selected, the others dim', () => {
    const result = edgeEmphasis(EDGES, { kind: 'edge', from: API, to: DB }, identity);
    expect(result.get(edgeKey(API, DB))).toBe('picked');
    expect(result.get(edgeKey(WEB, API))).toBe('dim');
    expect(result.get(edgeKey(UI, WEB))).toBe('dim');
    expect(result.get(edgeKey(UI, DB))).toBe('dim');
  });

  it('dims everything when the selected node is not visible', () => {
    const result = edgeEmphasis(EDGES, node('pkg:gone'), () => null);
    expect([...result.values()].every((v) => v === 'dim')).toBe(true);
  });
});

describe('nodeEmphasis', () => {
  const IDS = [WEB, API, DB, UI];

  it('keeps every node sharp without a selection', () => {
    const result = nodeEmphasis(IDS, EDGES, null, identity);
    expect(IDS.map((id) => result.get(id))).toEqual(['sharp', 'sharp', 'sharp', 'sharp']);
  });

  it('keeps the selected node and its direct neighbours sharp, dims the rest', () => {
    const result = nodeEmphasis(IDS, EDGES, node(API), identity);
    expect(result.get(API)).toBe('sharp');
    expect(result.get(WEB)).toBe('sharp');
    expect(result.get(DB)).toBe('sharp');
    expect(result.get(UI)).toBe('dim');
  });

  it('keeps only the two ends of a selected edge sharp', () => {
    const result = nodeEmphasis(IDS, EDGES, { kind: 'edge', from: API, to: DB }, identity);
    expect(result.get(API)).toBe('sharp');
    expect(result.get(DB)).toBe('sharp');
    expect(result.get(WEB)).toBe('dim');
    expect(result.get(UI)).toBe('dim');
  });

  it('never dims a node kept by the impact layer', () => {
    const result = nodeEmphasis(IDS, EDGES, node(API), identity, new Set([UI]));
    expect(result.get(UI)).toBe('sharp');
  });
});
