import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, Node, NodeKind, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { RepoBusiness } from './repo.business';

const META: MetaResponse = {
  repo: 'wide',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};

// The tree of the core: wide > packages > pkg-00 | pkg-01 > file > symbol.
const WIDE = 'pkg:wide';
const PACKAGES = 'pkg:wide/packages';
const P0 = 'pkg:wide/packages/pkg-00';
const P1 = 'pkg:wide/packages/pkg-01';
const P0_FILE = `${P0}::file:packages/pkg-00/file-000.ts`;
const P1_FILE = `${P1}::file:packages/pkg-01/file-002.ts`;
const P1_SYMBOL = `${P1_FILE}::sym:f1x2`;

const TREE: [string, NodeKind, string | null][] = [
  [WIDE, 'repo', null],
  [PACKAGES, 'module', WIDE],
  [P0, 'module', PACKAGES],
  [P1, 'module', PACKAGES],
  [P0_FILE, 'file', P0],
  [P1_FILE, 'file', P1],
  [`${P0_FILE}::sym:f0x0`, 'symbol', P0_FILE],
  [P1_SYMBOL, 'symbol', P1_FILE],
];

/** What the core answers: the root and its children, then the children of each `expand` entry. */
function serve(expand: readonly string[] = []): SnapshotResponse {
  const opened = new Set([WIDE, ...expand]);
  const included = new Set<string>([WIDE]);
  for (const [id, , parent] of TREE) {
    if (parent && included.has(parent) && opened.has(parent)) included.add(id);
  }
  const nodes: Node[] = TREE.filter(([id]) => included.has(id)).map(([id, kind, parent]) => {
    const all = TREE.filter(([, , p]) => p === id).length;
    const here = TREE.filter(([c, , p]) => p === id && included.has(c)).length;
    return {
      id,
      kind,
      subkind: 'x',
      parent,
      visibility: 'public',
      contentHash: 'h',
      ...(here < all ? { childCount: all } : {}),
    } as Node;
  });
  return {
    graph: { commit: 'c', edges: [], nodes },
    meta: {
      adapters: [],
      cachedFiles: 0,
      commit: 'c',
      date: '2026-01-01T00:00:00Z',
      detector: 'generic',
      ignoredFiles: 0,
      parsedFiles: 0,
      warnings: [],
    },
  };
}

interface Api {
  meta: ReturnType<typeof vi.fn>;
  snapshot: ReturnType<typeof vi.fn>;
}

function setup(
  snapshot: (ref: string, budget?: number, expand?: readonly string[]) => Promise<SnapshotResponse>,
) {
  const api: Api = {
    meta: vi.fn(() => Promise.resolve(META)),
    snapshot: vi.fn(snapshot),
  };
  TestBed.configureTestingModule({
    providers: [RepoBusiness, { provide: ReliefApiService, useValue: api }],
  });
  return { api, repo: TestBed.inject(RepoBusiness) };
}

const ids = (repo: RepoBusiness) => repo.snapshot()?.graph.nodes.map((n) => n.id) ?? [];
const node = (repo: RepoBusiness, id: string) =>
  repo.snapshot()?.graph.nodes.find((n) => n.id === id);
const lastExpand = (api: Api) => api.snapshot.mock.calls.at(-1)?.[2] as string[];

describe('RepoBusiness', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the snapshot with the 2000 nodes budget', async () => {
    const { api, repo } = setup((_ref, _budget, expand) => Promise.resolve(serve(expand)));
    await repo.load();
    expect(api.snapshot.mock.calls[0]?.[1]).toBe(2000);
    expect(node(repo, PACKAGES)?.childCount).toBe(2);
  });

  describe('expand', () => {
    it('loads a closed container and merges its children into the graph', async () => {
      const { api, repo } = setup((_ref, _budget, expand) => Promise.resolve(serve(expand)));
      await repo.load();
      expect(await repo.expand(PACKAGES)).toBe(true);

      expect(api.snapshot.mock.calls.at(-1)?.[1]).toBe(2000);
      expect(lastExpand(api)).toEqual([PACKAGES]);
      expect(ids(repo)).toEqual(expect.arrayContaining([WIDE, PACKAGES, P0, P1]));
      expect(node(repo, PACKAGES)?.childCount).toBeUndefined();
      expect(node(repo, P0)?.childCount).toBe(1);
      expect(repo.loading().size).toBe(0);
    });

    it('marks the container as loading while the core answers', async () => {
      let release: (r: SnapshotResponse) => void = () => undefined;
      const { repo } = setup((_ref, _budget, expand) =>
        expand?.length
          ? new Promise<SnapshotResponse>((resolve) => (release = resolve))
          : Promise.resolve(serve()),
      );
      await repo.load();
      const done = repo.expand(PACKAGES);
      expect(repo.loading().has(PACKAGES)).toBe(true);
      release(serve([PACKAGES]));
      await done;
      expect(repo.loading().has(PACKAGES)).toBe(false);
    });

    it('keeps both containers open when two expand calls overlap', async () => {
      const pending: { expand: readonly string[]; release: () => void }[] = [];
      const { api, repo } = setup((_ref, _budget, expand = []) =>
        expand.length && pending.length < 3
          ? new Promise<SnapshotResponse>((resolve) =>
              pending.push({ expand, release: () => resolve(serve(expand)) }),
            )
          : Promise.resolve(serve(expand)),
      );
      await repo.load();
      const opening = repo.expand(PACKAGES);
      pending[0]?.release();
      await opening;

      const first = repo.expand(P0);
      const second = repo.expand(P1);
      // The core answers the second one first.
      pending[2]?.release();
      pending[1]?.release();
      await Promise.all([first, second]);

      expect(node(repo, P0)?.childCount).toBeUndefined();
      expect(node(repo, P1)?.childCount).toBeUndefined();
      expect(ids(repo)).toEqual(expect.arrayContaining([P0_FILE, P1_FILE]));

      // And both are asked again with the next read of the snapshot.
      void api;
      const refreshed = repo.refreshSnapshot('feat/x');
      await refreshed;
      expect([...lastExpand(api)].sort()).toEqual([P0, P1, PACKAGES].sort());
    });
  });

  describe('reveal', () => {
    it('loads the ancestors of a node that is not in the graph so that it appears', async () => {
      const { api, repo } = setup((_ref, _budget, expand) => Promise.resolve(serve(expand)));
      await repo.load();
      expect(ids(repo)).not.toContain(P1_SYMBOL);

      expect(await repo.reveal(P1_SYMBOL)).toBe(true);

      expect([...lastExpand(api)].sort()).toEqual([WIDE, PACKAGES, P1, P1_FILE].sort());
      expect(ids(repo)).toContain(P1_SYMBOL);
      expect(node(repo, P1_FILE)?.childCount).toBeUndefined();
      // What was not on the way stays closed.
      expect(node(repo, P0)?.childCount).toBe(1);
    });
  });

  describe('refreshSnapshot', () => {
    it('asks again the budget and the containers opened on demand', async () => {
      const { api, repo } = setup((_ref, _budget, expand) => Promise.resolve(serve(expand)));
      await repo.load();
      await repo.expand(PACKAGES);

      await repo.refreshSnapshot('feat/x');

      const call = api.snapshot.mock.calls.at(-1);
      expect(call?.[0]).toBe('feat/x');
      expect(call?.[1]).toBe(2000);
      expect(call?.[2]).toEqual([PACKAGES]);
      expect(ids(repo)).toEqual(expect.arrayContaining([P0, P1]));
    });
  });
});
