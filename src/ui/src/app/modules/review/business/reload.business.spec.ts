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
const MODULE = `${API}::mod:billing`;
const FILE = `${API}::file:billing/invoice.ts`;
const KEPT = `${FILE}::sym:computeTotal`;
const GONE = `${FILE}::sym:applyDiscount`;
const ADDED = `${FILE}::sym:brandNewHelper`;

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

function graphOf(symbols: string[]): GraphSnapshot {
  return {
    commit: '1'.repeat(40),
    edges: [],
    nodes: [
      node('pkg:acme', 'repo', null),
      node(API, 'service', 'pkg:acme'),
      node(MODULE, 'module', API),
      node(FILE, 'file', MODULE),
      ...symbols.map((id) => node(id, 'symbol', FILE)),
    ],
  };
}

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

const DIFF: DiffResponse = {
  diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [] },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  commitReading: vi.fn(),
  reviewState: vi.fn(),
  setReviewState: vi.fn(),
};

/** What `snapshot` answers: changed by the spec between two loads, like the working tree would be. */
let current: GraphSnapshot;

async function open(range: string) {
  const repo = TestBed.inject(RepoBusiness);
  const map = TestBed.inject(MapBusiness);
  const diff = TestBed.inject(DiffBusiness);
  const reading = TestBed.inject(ReadingOrderBusiness);
  api.meta.mockResolvedValue({ ...META, range });
  await repo.load();
  await diff.load(range);
  await reading.load(range, DIFF.diff.base);
  map.setViewport(1000, 600);
  const snapshot = repo.snapshot();
  if (snapshot) map.show(snapshot.graph);
  return { repo, map, diff, reading, reload: TestBed.inject(ReloadBusiness) };
}

function resetCalls(): void {
  api.snapshot.mockClear();
  api.diff.mockClear();
}

describe('ReloadBusiness', () => {
  beforeEach(() => {
    current = graphOf([KEPT, GONE]);
    api.meta.mockReset();
    api.snapshot.mockReset().mockImplementation(async () => ({ graph: current, meta: {} }));
    api.diff.mockReset().mockResolvedValue(DIFF);
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.commitReading.mockReset().mockResolvedValue({ commits: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [FILE] });
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

  it.each(['WORKTREE', 'INDEX'])('reloads when the window regains focus on %s', async (range) => {
    const { reload } = await open(range);
    expect(reload.canReload()).toBe(true);
    resetCalls();
    await reload.onWindowFocus();
    expect(api.diff).toHaveBeenCalledTimes(1);
    expect(api.diff.mock.calls[0]?.[0]).toBe(range);
    expect(api.diff.mock.calls[0]?.[1]).toBe(2000);
    expect(api.snapshot).toHaveBeenCalledWith(range, 2000, []);
  });

  it('does not reload on focus for a range between commits', async () => {
    const { reload } = await open('main...feat/promo-codes');
    expect(reload.canReload()).toBe(false);
    resetCalls();
    await reload.onWindowFocus();
    expect(api.diff).not.toHaveBeenCalled();
    expect(api.snapshot).not.toHaveBeenCalled();
  });

  it('does not reload on focus for A..B either', async () => {
    const { reload } = await open('main..feat/promo-codes');
    expect(reload.canReload()).toBe(false);
    resetCalls();
    await reload.onWindowFocus();
    expect(api.diff).not.toHaveBeenCalled();
  });

  it('the button reloads the snapshot and the diff of the working tree range', async () => {
    const { reload, map } = await open('WORKTREE');
    current = graphOf([KEPT, GONE, ADDED]);
    resetCalls();
    await reload.reload();
    expect(api.snapshot).toHaveBeenCalledWith('WORKTREE', 2000, []);
    expect(api.diff.mock.calls[0]?.[0]).toBe('WORKTREE');
    expect(api.diff.mock.calls[0]?.[1]).toBe(2000);
    expect(map.search('brandNewHelper').map((r) => r.id)).toEqual([ADDED]);
  });

  it('keeps the selection, the zoom level and the seen state', async () => {
    const { reload, map, reading } = await open('WORKTREE');
    map.selectNode(KEPT);
    map.setLevel(2);
    expect(reading.isSeen(FILE)).toBe(true);
    current = graphOf([KEPT, GONE, ADDED]);
    await reload.reload();
    expect(map.selectedNodeId()).toBe(KEPT);
    expect(map.level()).toBe(2);
    expect(reading.isSeen(FILE)).toBe(true);
  });

  it('deselects a node that disappeared, without an error', async () => {
    const { reload, map, diff } = await open('WORKTREE');
    map.selectNode(GONE);
    current = graphOf([KEPT]);
    await reload.reload();
    expect(map.selectedNodeId()).toBeNull();
    expect(diff.status()).toBe('ready');
    expect(diff.error()).toBeNull();
    expect(map.search('applyDiscount')).toEqual([]);
  });

  it('drops a focus that arrives while a reload is running: the diff is asked once', async () => {
    const { reload } = await open('WORKTREE');
    let release!: (value: DiffResponse) => void;
    resetCalls();
    api.diff.mockImplementation(() => new Promise<DiffResponse>((res) => (release = res)));
    const first = reload.onWindowFocus();
    const second = reload.onWindowFocus();
    await vi.waitFor(() => expect(api.diff).toHaveBeenCalled());
    release(DIFF);
    await Promise.all([first, second]);
    expect(api.diff).toHaveBeenCalledTimes(1);
  });

  it('absorbs a failing snapshot and can reload again afterwards', async () => {
    const { reload } = await open('WORKTREE');
    api.snapshot.mockRejectedValueOnce(new Error('index failed'));
    await expect(reload.reload()).resolves.toBeUndefined();
    current = graphOf([KEPT, GONE, ADDED]);
    resetCalls();
    await reload.reload();
    expect(api.diff).toHaveBeenCalledTimes(1);
  });

  it('keeps the commit selected in commit mode', async () => {
    const commit = 'c'.repeat(40);
    api.commitReading.mockResolvedValue({
      commits: [{ commit, short: 'cccccccc', message: 'feat: x', files: [], otherFiles: 0 }],
    });
    const { reload, reading } = await open('WORKTREE');
    reading.setMode('commit');
    reading.selectCommit(commit);
    expect(reading.selectedCommit()).toBe(commit);
    await reload.reload();
    expect(reading.selectedCommit()).toBe(commit);
  });

  it('never shows the diff as loading while it reloads', async () => {
    const { reload, diff } = await open('WORKTREE');
    const seen: string[] = [];
    api.diff.mockImplementation(async () => {
      seen.push(diff.status());
      return DIFF;
    });
    await reload.reload();
    expect(seen).toEqual(['ready']);
    expect(diff.status()).toBe('ready');
  });
});
