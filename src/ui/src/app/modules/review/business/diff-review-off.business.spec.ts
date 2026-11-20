import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiffResponse,
  GraphSnapshot,
  Node,
  NodeKind,
  SnapshotResponse,
} from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffBusiness } from './diff.business';

const PKG = 'pkg:@acme/web';
const KEEP = `${PKG}::file:src/keep.ts`;
const OLD_FILE = `${PKG}::file:src/legacy.ts`;
const OLD_FORMAT = `${PKG}::file:src/utils/format.ts`;

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const HEAD: GraphSnapshot = {
  commit: 'b'.repeat(40),
  nodes: [node(PKG, 'package', null), node(KEEP, 'file', PKG)],
  edges: [],
};

const BASE: GraphSnapshot = {
  commit: 'a'.repeat(40),
  nodes: [
    node(PKG, 'package', null),
    node(KEEP, 'file', PKG),
    node(OLD_FILE, 'file', PKG),
    node(OLD_FORMAT, 'file', PKG),
  ],
  edges: [{ from: KEEP, to: OLD_FILE, kind: 'imports', precision: 'resolved' }],
};

const DIFF: DiffResponse = {
  diff: {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    files: [],
    nodes: [
      { id: OLD_FILE, status: 'removed', linesAdded: 0, linesRemoved: 6 },
      { id: OLD_FORMAT, status: 'removed', linesAdded: 0, linesRemoved: 3 },
      {
        id: `${PKG}::file:src/shared/format.ts`,
        status: 'added',
        linesAdded: 0,
        linesRemoved: 0,
      },
    ],
    edges: [{ from: KEEP, to: OLD_FILE, kind: 'imports', status: 'removed', commit: null }],
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [{ from: 'src/utils/format.ts', to: 'src/shared/format.ts' }],
};

const api = { diff: vi.fn(), snapshot: vi.fn() };

function ids(graph: GraphSnapshot): string[] {
  return graph.nodes.map((n) => n.id).sort();
}

describe('DiffBusiness, graph to draw', () => {
  beforeEach(() => {
    api.diff.mockReset().mockResolvedValue(DIFF);
    api.snapshot
      .mockReset()
      .mockResolvedValue({ graph: BASE, meta: {} } as unknown as SnapshotResponse);
    TestBed.configureTestingModule({
      providers: [DiffBusiness, provideRouter([]), { provide: ReliefApiService, useValue: api }],
    });
  });

  it('adds the nodes and edges that only exist in the base while "Relire la PR" is on', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/x');
    const graph = business.graphWithBase(HEAD);
    expect(ids(graph)).toEqual([KEEP, OLD_FILE, OLD_FORMAT, PKG].sort());
    expect(graph.edges).toHaveLength(1);
  });

  it('draws the head alone, without removed nodes or edges, when "Relire la PR" is off', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/x');
    business.setReviewMode(false);
    const graph = business.graphWithBase(HEAD);
    expect(ids(graph)).toEqual([KEEP, PKG].sort());
    expect(graph.edges).toEqual([]);
  });

  it('brings the base-only things back when "Relire la PR" is turned on again', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('main...feat/x');
    business.setReviewMode(false);
    business.setReviewMode(true);
    expect(ids(business.graphWithBase(HEAD))).toContain(OLD_FILE);
  });
});
