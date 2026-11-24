import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, Node, NodeKind, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from './map.business';

// K08, business seam: the map of a workspace has a level Repos above Systems; a repository box
// zooms into its systems. A repository snapshot keeps its four levels.

const META: MetaResponse = {
  repo: 'shop',
  range: null,
  branches: ['main'],
  tags: [],
  workspace: {
    repos: [
      { name: 'web', labels: ['front'] },
      { name: 'api', labels: ['back'] },
    ],
  },
};

function node(id: string, kind: NodeKind, parent: string | null, extra: Partial<Node> = {}): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h', ...extra };
}

const WEB = 'repo:web/pkg:shop-web';
const API = 'repo:api/pkg:shop-api';

function snapshot(nodes: Node[]): SnapshotResponse {
  return {
    graph: { commit: '0123456789abcdef0123456789abcdef01234567', edges: [], nodes },
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
}

const WORKSPACE = snapshot([
  node('repo:web', 'repo', null, { branch: 'feat/order-badge', labels: ['front'] }),
  node(WEB, 'package', 'repo:web'),
  node(`${WEB}::file:src/a.ts`, 'file', WEB),
  node('repo:api', 'repo', null, { branch: 'feat/order-total', labels: ['back'] }),
  node(API, 'package', 'repo:api'),
  node(`${API}::file:src/b.ts`, 'file', API),
]);

const MONO = snapshot([
  node('pkg:acme', 'repo', null),
  node('pkg:acme/web', 'service', 'pkg:acme'),
  node('pkg:acme/web::file:a.ts', 'file', 'pkg:acme/web'),
]);

const VIEWPORT = { width: 1000, height: 600 };

async function loaded(response: SnapshotResponse, meta: MetaResponse): Promise<MapBusiness> {
  TestBed.configureTestingModule({
    providers: [
      MapBusiness,
      {
        provide: ReliefApiService,
        useValue: {
          meta: vi.fn().mockResolvedValue(meta),
          snapshot: vi.fn().mockResolvedValue(response),
        },
      },
    ],
  });
  const business = TestBed.inject(MapBusiness);
  business.setViewport(VIEWPORT.width, VIEWPORT.height);
  await business.load();
  return business;
}

const settle = (): void => {
  vi.advanceTimersByTime(1000);
};

describe('MapBusiness on a workspace', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });

  afterEach(() => vi.useRealTimers());

  it('has the level Repos above the others', async () => {
    const map = await loaded(WORKSPACE, META);
    expect(map.levels()).toEqual(['repos', 'system', 'modules', 'files', 'symbols']);
  });

  it('has no level Repos on a single repository', async () => {
    const map = await loaded(MONO, { ...META, workspace: undefined });
    expect(map.levels()).toEqual(['system', 'modules', 'files', 'symbols']);
  });

  it('shows the repositories as closed boxes with their systems behind, at level 0', async () => {
    const map = await loaded(WORKSPACE, META);
    map.setLevel(0);
    settle();
    const nodes = map.visibleNodes();
    expect(nodes.find((n) => n.id === 'repo:web')).toMatchObject({ kind: 'repo', mode: 'box' });
    expect(nodes.find((n) => n.id === 'repo:api')).toMatchObject({ kind: 'repo', mode: 'box' });
    expect(nodes.find((n) => n.id === WEB)?.mode).toBe('ghost');
  });

  it('opens the repositories and their systems at level 1', async () => {
    const map = await loaded(WORKSPACE, META);
    map.setLevel(1);
    settle();
    expect(map.level()).toBe(1);
    const nodes = map.visibleNodes();
    expect(nodes.find((n) => n.id === 'repo:web')?.mode).toBe('open');
    expect(nodes.find((n) => n.id === WEB)?.mode).toBe('open');
  });

  it('zooms into a repository: its box fits the screen and its systems show', async () => {
    const map = await loaded(WORKSPACE, META);
    map.setLevel(0);
    settle();
    map.dive('repo:web');
    settle();
    const nodes = map.visibleNodes();
    const box = nodes.find((n) => n.id === 'repo:web');
    expect(box).toBeDefined();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.w).toBeLessThanOrEqual(VIEWPORT.width);
    expect(nodes.find((n) => n.id === WEB)).toBeDefined();
  });

  it('names the repository in the breadcrumbs, after the workspace', async () => {
    const map = await loaded(WORKSPACE, META);
    map.selectNode('repo:web');
    settle();
    expect(
      map.breadcrumbs().map((c) => (c.kind === 'level' ? `level ${c.level}` : c.label)),
    ).toEqual(['shop', 'web']);
  });
});
