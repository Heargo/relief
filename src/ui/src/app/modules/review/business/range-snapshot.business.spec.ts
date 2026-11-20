import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiffResponse,
  GraphSnapshot,
  MetaResponse,
  Node,
  NodeKind,
} from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from '../../map/business/map.business';
import { RepoBusiness } from '../../map/business/repo.business';
import { DiffBusiness } from './diff.business';
import { ReadingOrderBusiness } from './reading-order.business';
import { ReloadBusiness } from './reload.business';

const API = 'pkg:@acme/api';
const FILE = `${API}::file:index.ts`;
const ADDED_FILE = `${API}::file:brand-new.ts`;

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

const BASE: GraphSnapshot = {
  commit: '1'.repeat(40),
  edges: [],
  nodes: [
    node('pkg:acme', 'repo', null),
    node(API, 'service', 'pkg:acme'),
    node(FILE, 'file', API),
  ],
};
const WITH_ADDED: GraphSnapshot = {
  ...BASE,
  nodes: [...BASE.nodes, node(ADDED_FILE, 'file', API)],
};

const DIFF: DiffResponse = {
  diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [] },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

function metaOf(range: string | null): MetaResponse {
  return { repo: 'acme-shop', range, branches: ['main', 'feat/promo-codes'], tags: [] };
}

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  commitReading: vi.fn(),
  reviewState: vi.fn(),
  setReviewState: vi.fn(),
};

describe('the map snapshot follows the head of the range', () => {
  beforeEach(() => {
    api.meta.mockReset();
    // The working tree has the added file; no commit does.
    api.snapshot.mockReset().mockImplementation(async (ref: string) => ({
      graph: ref === 'WORKTREE' ? WITH_ADDED : BASE,
      meta: {},
    }));
    api.diff.mockReset().mockResolvedValue(DIFF);
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.commitReading.mockReset().mockResolvedValue({ commits: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        RepoBusiness,
        MapBusiness,
        DiffBusiness,
        ReadingOrderBusiness,
        ReloadBusiness,
        provideRouter([]),
        { provide: ReliefApiService, useValue: api },
      ],
    });
  });

  it('MapBusiness.load asks the working tree snapshot when there is no range', async () => {
    api.meta.mockResolvedValue(metaOf(null));
    const map = TestBed.inject(MapBusiness);
    map.setViewport(1000, 600);
    await map.load();
    expect(api.snapshot).toHaveBeenCalledWith('WORKTREE');
    expect(map.search('brand-new').map((r) => r.id)).toEqual([ADDED_FILE]);
  });

  it('RepoBusiness.load asks the working tree snapshot when there is no range', async () => {
    api.meta.mockResolvedValue(metaOf(null));
    const repo = TestBed.inject(RepoBusiness);
    await repo.load();
    expect(api.snapshot.mock.calls[0][0]).toBe('WORKTREE');
    expect(repo.ref()).toBe('WORKTREE');
  });

  it('RepoBusiness.load asks the working tree snapshot for a single revision', async () => {
    api.meta.mockResolvedValue(metaOf('main'));
    const repo = TestBed.inject(RepoBusiness);
    await repo.load();
    expect(api.snapshot.mock.calls[0][0]).toBe('WORKTREE');
  });

  it('the reload asks the working tree snapshot when there is no range', async () => {
    api.meta.mockResolvedValue(metaOf(null));
    const repo = TestBed.inject(RepoBusiness);
    const diff = TestBed.inject(DiffBusiness);
    await repo.load();
    await diff.load(null);
    api.snapshot.mockClear();
    await TestBed.inject(ReloadBusiness).reload();
    expect(api.snapshot).toHaveBeenCalledWith('WORKTREE');
  });

  it('changing the range asks the snapshot of the new head and keeps the map view', async () => {
    api.meta.mockResolvedValue(metaOf('main...feat/promo-codes'));
    const repo = TestBed.inject(RepoBusiness);
    const map = TestBed.inject(MapBusiness);
    const diff = TestBed.inject(DiffBusiness);
    await repo.load();
    await diff.load('main...feat/promo-codes');
    map.setViewport(1000, 600);
    map.show(repo.snapshot()!.graph);
    expect(map.search('brand-new')).toEqual([]);
    map.setLevel(1);

    api.snapshot.mockClear();
    await diff.setRange('WORKTREE');
    await vi.waitFor(() => expect(api.snapshot).toHaveBeenCalledWith('WORKTREE'));
    await vi.waitFor(() => expect(map.search('brand-new').map((r) => r.id)).toEqual([ADDED_FILE]));
    expect(map.level()).toBe(1);
  });
});
