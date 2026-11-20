import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, GraphSnapshot, Node } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffBusiness } from './diff.business';
import { ReadingOrderBusiness } from './reading-order.business';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const PKG = 'pkg:wide/packages/pkg-03';
const FILE = `${PKG}::file:packages/pkg-03/file-005.ts`;

function node(id: string, kind: Node['kind'], parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

/** The review subgraph: the changed file and its ancestors, the package otherwise closed. */
const SUBGRAPH: GraphSnapshot = {
  commit: HEAD,
  edges: [],
  nodes: [node('pkg:wide', 'repo', null), node(PKG, 'module', 'pkg:wide'), node(FILE, 'file', PKG)],
};

const RESPONSE: DiffResponse = {
  diff: {
    base: BASE,
    head: HEAD,
    files: [{ path: 'packages/pkg-03/file-005.ts', linesAdded: 3, linesRemoved: 0 }],
    nodes: [{ id: FILE, status: 'added', linesAdded: 3, linesRemoved: 0 }],
    edges: [],
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
  graph: SUBGRAPH,
};

const api = {
  diff: vi.fn(),
  snapshot: vi.fn(),
  readingOrder: vi.fn(),
  commitReading: vi.fn(),
  reviewState: vi.fn(),
  setReviewState: vi.fn(),
};

describe('review of a big repository: the diff carries the subgraph', () => {
  beforeEach(() => {
    api.diff.mockReset().mockResolvedValue(RESPONSE);
    api.snapshot.mockReset().mockResolvedValue({ graph: { commit: HEAD, nodes: [], edges: [] } });
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.commitReading.mockReset().mockResolvedValue({ commits: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        DiffBusiness,
        ReadingOrderBusiness,
        provideRouter([]),
        { provide: ReliefApiService, useValue: api },
      ],
    });
  });

  it('asks the diff with the display budget', async () => {
    await TestBed.inject(DiffBusiness).load('WORKTREE');
    expect(api.diff).toHaveBeenCalledTimes(1);
    expect(api.diff.mock.calls[0]?.[0]).toBe('WORKTREE');
    expect(api.diff.mock.calls[0]?.[1]).toBe(2000);
  });

  it('shows DiffResponse.graph as the head graph', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('WORKTREE');
    expect(business.status()).toBe('ready');
    expect(business.headGraph()).toEqual(SUBGRAPH);
  });

  it('no longer reads the full snapshots when the budget applies', async () => {
    await TestBed.inject(DiffBusiness).load('WORKTREE');
    expect(api.snapshot).not.toHaveBeenCalled();
  });

  it('reads the diff again with the budget on reload', async () => {
    const business = TestBed.inject(DiffBusiness);
    await business.load('WORKTREE');
    api.diff.mockClear();
    await business.reload();
    expect(api.diff.mock.calls[0]?.[1]).toBe(2000);
    expect(api.snapshot).not.toHaveBeenCalled();
  });

  it('the commit view of the reading order asks the budget and shows its graph', async () => {
    const commit = 'c'.repeat(40);
    api.commitReading.mockResolvedValue({
      commits: [{ commit, short: 'cccccccc', message: 'feat: x', files: [], otherFiles: 0 }],
    });
    const reading = TestBed.inject(ReadingOrderBusiness);
    await reading.load('WORKTREE', BASE);
    api.diff.mockClear();
    reading.selectCommit(commit);
    await vi.waitFor(() => expect(reading.commitView()).not.toBeNull());
    expect(api.diff.mock.calls[0]?.[1]).toBe(2000);
    expect(api.snapshot).not.toHaveBeenCalled();
    expect(reading.commitView()?.head).toEqual(SUBGRAPH);
  });
});
