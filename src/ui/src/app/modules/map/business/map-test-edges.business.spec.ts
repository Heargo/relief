import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiffResponse,
  Edge,
  MetaResponse,
  Node,
  NodeKind,
  SnapshotResponse,
} from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from './map.business';

// R17: in review, the "tested by N (of which M new)" badge counts every test of the target, not
// only the modified ones: it is computed before the "unchanged edges" layer filters the edges.

const META: MetaResponse = {
  repo: 'shop',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};

function node(id: string, kind: NodeKind, parent: string | null, isTest = false): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h', isTest };
}

function imports(from: string, to: string): Edge {
  return { from, to, kind: 'imports', precision: 'resolved' };
}

const PKG = 'pkg:app';
const PRICING = `${PKG}::file:src/pricing.ts`;
const CART = `${PKG}::file:src/cart.ts`;
const PRICING_T1 = `${PKG}::file:tests/pricing.a.test.ts`;
const PRICING_T2 = `${PKG}::file:tests/pricing.b.test.ts`;
const CART_T = `${PKG}::file:tests/cart.test.ts`;

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [
      imports(PRICING_T1, PRICING),
      imports(PRICING_T2, PRICING),
      imports(CART_T, CART),
      imports(CART, PRICING),
    ],
    nodes: [
      node('pkg:root', 'repo', null),
      node(PKG, 'package', 'pkg:root'),
      node(PRICING, 'file', PKG),
      node(CART, 'file', PKG),
      node(PRICING_T1, 'file', PKG, true),
      node(PRICING_T2, 'file', PKG, true),
      node(CART_T, 'file', PKG, true),
    ],
  },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 1,
    warnings: [],
  },
};

// Only one of the two tests of `pricing.ts` is modified by the pull request.
const DIFF: DiffResponse = {
  diff: {
    base: 'main',
    head: 'feat/x',
    files: [],
    nodes: [],
    edges: [{ from: PRICING_T1, to: PRICING, kind: 'imports', status: 'added', commit: null }],
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

describe('MapBusiness, tests badges in review', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    TestBed.configureTestingModule({
      providers: [
        MapBusiness,
        {
          provide: ReliefApiService,
          useValue: {
            meta: vi.fn().mockResolvedValue(META),
            snapshot: vi.fn().mockResolvedValue(SNAPSHOT),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function review(): Promise<MapBusiness> {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1000, 600);
    await business.load();
    business.setDiff(DIFF);
    business.setReviewMode(true);
    business.setShowUnchangedEdges(false);
    business.setLevel(2);
    vi.advanceTimersByTime(1000);
    return business;
  }

  it('counts all the tests of a target, the modified ones as new', async () => {
    const business = await review();
    expect(business.testBadges().get(PRICING)).toEqual({ count: 2, added: 1 });
  });

  it('keeps the badge of a target whose only test did not move', async () => {
    const business = await review();
    expect(business.testBadges().get(CART)).toEqual({ count: 1, added: 0 });
  });
});
