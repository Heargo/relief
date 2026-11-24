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

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

function call(from: string, to: string): Edge {
  return { from, to, kind: 'calls', precision: 'resolved' };
}

const WEB = 'pkg:@acme/web';
const WEB_FILE = `${WEB}::file:Promo.tsx`;
const VALIDATE = `${WEB_FILE}::sym:validateCodeLocally`;
const RENDER = `${WEB_FILE}::sym:PromoCodeInput`;
const API = 'pkg:@acme/api';
const API_FILE = `${API}::file:checkout.ts`;
const CHECKOUT = `${API_FILE}::sym:checkout`;
const DB = 'pkg:@acme/db';
const DB_FILE = `${DB}::file:discountRepo.ts`;
const FIND = `${DB_FILE}::sym:findDiscountByCode`;
const CREATE = `${DB_FILE}::sym:createDiscount`;

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [
      call(VALIDATE, FIND),
      call(RENDER, CREATE),
      call(RENDER, VALIDATE),
      call(CHECKOUT, FIND),
    ],
    nodes: [
      node('pkg:acme', 'repo', null),
      node(WEB, 'service', 'pkg:acme'),
      node(WEB_FILE, 'file', WEB),
      node(VALIDATE, 'symbol', WEB_FILE),
      node(RENDER, 'symbol', WEB_FILE),
      node(API, 'service', 'pkg:acme'),
      node(API_FILE, 'file', API),
      node(CHECKOUT, 'symbol', API_FILE),
      node(DB, 'package', 'pkg:acme'),
      node(DB_FILE, 'file', DB),
      node(FIND, 'symbol', DB_FILE),
      node(CREATE, 'symbol', DB_FILE),
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

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(1000, 600);
  await business.load();
  return business;
}

describe('MapBusiness, aggregated edges', () => {
  beforeEach(() => {
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

  it('has no edges before the snapshot arrives', () => {
    expect(TestBed.inject(MapBusiness).edges()).toEqual([]);
  });

  it('exposes the edges aggregated on the systems at level 0', async () => {
    const business = await loaded();
    const edges = business.edges();
    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.from === WEB && e.to === DB)?.count).toBe(2);
    expect(edges.find((e) => e.from === API && e.to === DB)?.count).toBe(1);
  });

  it('selecting an edge exposes its fine links', async () => {
    const business = await loaded();
    expect(business.selectedEdge()).toBeNull();
    business.selectEdge(WEB, DB);
    expect(business.selectedEdge()?.from).toBe(WEB);
    expect(business.selectedEdge()?.to).toBe(DB);
    expect(business.selectedEdge()?.links).toEqual([call(VALIDATE, FIND), call(RENDER, CREATE)]);
  });

  it('clears the selected edge', async () => {
    const business = await loaded();
    business.selectEdge(WEB, DB);
    business.clearEdgeSelection();
    expect(business.selectedEdge()).toBeNull();
  });

  it('selecting a link selects the symbol it starts from', async () => {
    const business = await loaded();
    expect(business.selectedNodeId()).toBeNull();
    business.selectEdge(WEB, DB);
    business.selectLink(call(VALIDATE, FIND));
    expect(business.selectedNodeId()).toBe(VALIDATE);
  });

  it('selecting an edge empties the node selection, and the other way round', async () => {
    const business = await loaded();
    business.selectResult(WEB);
    business.selectEdge(WEB, DB);
    expect(business.selectedNodeId()).toBeNull();
    expect(business.selectedEdge()?.to).toBe(DB);

    business.selectResult(WEB);
    expect(business.selectedEdge()).toBeNull();
    expect(business.selectedNodeId()).toBe(WEB);
  });

  it('Escape deselects the selected edge', async () => {
    const business = await loaded();
    business.selectEdge(WEB, DB);
    expect(business.selectedEdge()).not.toBeNull();
    business.escape();
    vi.advanceTimersByTime(1000);
    expect(business.selectedEdge()).toBeNull();
  });

  it('shows the unchanged edges layer in exploration and can hide it', async () => {
    const business = await loaded();
    business.setReviewMode(false);
    expect(business.showUnchangedEdges()).toBe(true);
    business.setShowUnchangedEdges(false);
    expect(business.showUnchangedEdges()).toBe(false);
    // outside review mode every edge is unchanged
    expect(business.edges()).toEqual([]);
    business.setShowUnchangedEdges(true);
    expect(business.edges()).toHaveLength(2);
  });

  describe('unchanged edges per mode', () => {
    const DIFF: DiffResponse = {
      diff: {
        base: 'main',
        head: 'feat/promo-codes',
        files: [],
        nodes: [],
        edges: [{ from: CHECKOUT, to: FIND, kind: 'calls', status: 'added', commit: null }],
      },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    };

    beforeEach(() => {
      localStorage.clear();
    });

    it('hides them by default in review and shows them in exploration', async () => {
      const business = await loaded();
      business.setDiff(DIFF);
      business.setReviewMode(true);
      expect(business.showUnchangedEdges()).toBe(false);
      business.setReviewMode(false);
      expect(business.showUnchangedEdges()).toBe(true);
    });

    it('keeps only the changed edges in review by default', async () => {
      const business = await loaded();
      business.setDiff(DIFF);
      business.setReviewMode(true);
      expect(business.edges().map((e) => `${e.from}>${e.to}`)).toEqual([`${API}>${DB}`]);
      business.setReviewMode(false);
      expect(business.edges()).toHaveLength(2);
    });

    it('remembers the choice of each mode apart', async () => {
      const business = await loaded();
      business.setReviewMode(true);
      business.setShowUnchangedEdges(true);
      business.setReviewMode(false);
      expect(business.showUnchangedEdges()).toBe(true);
      business.setShowUnchangedEdges(false);
      business.setReviewMode(true);
      expect(business.showUnchangedEdges()).toBe(true);
      business.setReviewMode(false);
      expect(business.showUnchangedEdges()).toBe(false);
    });

    it('stores the choice per mode and reads it back in a new session', async () => {
      const first = await loaded();
      first.setReviewMode(true);
      first.setShowUnchangedEdges(true);
      first.setReviewMode(false);
      first.setShowUnchangedEdges(false);
      expect(localStorage.getItem('relief.unchangedEdges.review')).toBe('true');
      expect(localStorage.getItem('relief.unchangedEdges.explore')).toBe('false');

      TestBed.resetTestingModule();
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
      const second = await loaded();
      second.setReviewMode(true);
      expect(second.showUnchangedEdges()).toBe(true);
      second.setReviewMode(false);
      expect(second.showUnchangedEdges()).toBe(false);
    });

    it('keeps the unchanged edges visible in review when no diff is active', async () => {
      const business = await loaded();
      business.setReviewMode(true);
      expect(business.edges()).toHaveLength(2);
      business.setDiff(DIFF);
      expect(business.edges()).toHaveLength(1);
      business.setDiff(null);
      expect(business.edges()).toHaveLength(2);
    });

    it('lists the unchanged edges of the selected node in its inspector when the layer is off', async () => {
      const business = await loaded();
      business.setDiff(DIFF);
      business.setReviewMode(true);
      business.selectResult(WEB);
      expect(business.selectedNodeEdges().dependsOn.map((e) => `${e.from}>${e.to}`)).toEqual([
        `${WEB}>${DB}`,
      ]);
    });

    it('keeps the unchanged edges of the selected node when the layer is off', async () => {
      const business = await loaded();
      business.setDiff(DIFF);
      business.setReviewMode(true);
      expect(business.edges().every((e) => e.changed)).toBe(true);

      business.selectResult(WEB);
      const unchanged = business.edges().filter((e) => !e.changed);
      expect(unchanged.length).toBeGreaterThan(0);
      expect(
        unchanged.every((e) => business.within(e.from, WEB) || business.within(e.to, WEB)),
      ).toBe(true);
    });
  });
});
