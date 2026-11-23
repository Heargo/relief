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

// U31: at the files level, four files of `app` import `lib/hub.ts`; `lib/hub.ts` receives a
// bundle (>= 3 edges by the same side), whose id names its box and side. Selecting the bundle
// makes it `selectedBundle()`, clears the node and edge selections, and `clearBundleSelection()`
// (like any other selection) lets go of it.

const META: MetaResponse = {
  repo: 'star',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};

const node = (id: string, kind: NodeKind, parent: string | null): Node => ({
  id,
  kind,
  subkind: 'x',
  parent,
  visibility: 'public',
  contentHash: 'h',
  isTest: false,
});
const imports = (from: string, to: string): Edge => ({
  from,
  to,
  kind: 'imports',
  precision: 'resolved',
});

const APP = 'pkg:app';
const LIB = 'pkg:lib';
const HUB = `${LIB}::file:src/hub.ts`;
const USERS = [1, 2, 3, 4].map((n) => `${APP}::file:src/u${n}.ts`);

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: USERS.map((u) => imports(u, HUB)),
    nodes: [
      node('pkg:root', 'repo', null),
      node(APP, 'package', 'pkg:root'),
      node(LIB, 'package', 'pkg:root'),
      node(HUB, 'file', LIB),
      ...USERS.map((u) => node(u, 'file', APP)),
    ],
  },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 5,
    warnings: [],
  },
};

const DIFF: DiffResponse = {
  diff: {
    base: 'main',
    head: 'feat/x',
    files: [],
    nodes: [],
    edges: USERS.slice(0, 3).map((u) => ({
      from: u,
      to: HUB,
      kind: 'imports' as const,
      status: 'added' as const,
      commit: null,
    })),
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

describe('MapBusiness, edge bundles', () => {
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
  afterEach(() => vi.useRealTimers());

  async function files(): Promise<MapBusiness> {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1400, 900);
    await business.load();
    business.setDiff(DIFF);
    business.setReviewMode(true);
    business.setShowUnchangedEdges(true);
    business.setLevel(2);
    vi.advanceTimersByTime(1000);
    return business;
  }

  it('bundles the edges that arrive in the hub, whichever side they come by', async () => {
    const business = await files();
    const bundles = business.bundles();
    const hub = bundles.filter((b) => b.box === HUB && b.end === 'in');
    expect(hub.reduce((n, b) => n + b.count, 0)).toBeGreaterThanOrEqual(3);
    for (const b of hub) {
      expect(b.id).toBe(`in:${HUB}:${b.side}`);
      expect(b.count).toBeGreaterThanOrEqual(3);
    }
  });

  it('counts the new edges of the bundle in review', async () => {
    const business = await files();
    const [bundle] = business.bundles().filter((b) => b.box === HUB);
    expect(bundle.added).toBeGreaterThanOrEqual(1);
    expect(bundle.added).toBeLessThanOrEqual(3);
  });

  it('selects a bundle: it is the selected bundle, nothing else is selected', async () => {
    const business = await files();
    business.selectNode(USERS[0]);
    const [bundle] = business.bundles().filter((b) => b.box === HUB);
    business.selectBundle(bundle.id);
    expect(business.selectedBundle()?.id).toBe(bundle.id);
    expect(business.selectedBundle()?.branches.length).toBe(bundle.count);
    expect(business.selectedNodeId()).toBeNull();
    expect(business.selectedEdge()).toBeNull();
  });

  it('lets go of the bundle when a node is selected, or the selection cleared', async () => {
    const business = await files();
    const [bundle] = business.bundles().filter((b) => b.box === HUB);
    business.selectBundle(bundle.id);
    business.selectNode(HUB);
    expect(business.selectedBundle()).toBeNull();
    business.selectBundle(bundle.id);
    business.clearBundleSelection();
    expect(business.selectedBundle()).toBeNull();
  });

  it('lets go of the bundle when a search result is selected', async () => {
    const business = await files();
    const [bundle] = business.bundles().filter((b) => b.box === HUB);
    business.selectBundle(bundle.id);
    business.selectResult(USERS[0]);
    vi.advanceTimersByTime(1000);
    expect(business.selectedBundle()).toBeNull();
  });

  it('lets go of the bundle on a step back in the history', async () => {
    const business = await files();
    business.selectNode(USERS[0]);
    business.selectNode(USERS[1]);
    const [bundle] = business.bundles().filter((b) => b.box === HUB);
    business.selectBundle(bundle.id);
    expect(business.selectedBundle()).not.toBeNull();
    business.goBack();
    vi.advanceTimersByTime(1000);
    expect(business.selectedBundle()).toBeNull();
  });

  it('ignores an unknown bundle id', async () => {
    const business = await files();
    business.selectBundle('in:nowhere:left');
    expect(business.selectedBundle()).toBeNull();
  });
});

// Edges internal to the selected node are hidden (emphasis `hidden`): they join no bundle and
// are not counted. Here `app` holds hub2 and u1..u4; u1..u3 import hub2.
const HUB2 = `${APP}::file:src/hub2.ts`;
const INNER: SnapshotResponse = {
  ...SNAPSHOT,
  graph: {
    ...SNAPSHOT.graph,
    edges: USERS.slice(0, 3).map((u) => imports(u, HUB2)),
    nodes: [...SNAPSHOT.graph.nodes, node(HUB2, 'file', APP)],
  },
};

describe('MapBusiness, bundles and hidden edges', () => {
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
            snapshot: vi.fn().mockResolvedValue(INNER),
          },
        },
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('keeps out of the bundles the edges internal to the selected node', async () => {
    const business = TestBed.inject(MapBusiness);
    business.setViewport(1400, 900);
    await business.load();
    business.setLevel(2);
    vi.advanceTimersByTime(1000);
    const into = () => business.bundles().filter((b) => b.box === HUB2 && b.end === 'in');
    expect(into().reduce((n, b) => n + b.count, 0)).toBe(3);
    business.selectNode(APP);
    vi.advanceTimersByTime(1000);
    expect(into()).toEqual([]);
  });
});
