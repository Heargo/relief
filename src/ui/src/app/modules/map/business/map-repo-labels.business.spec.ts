import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, Node, NodeKind, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from './map.business';

// K09, business seam: the label filter hides the repositories that do not carry a chosen label,
// and what they contain, from the scene.

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

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      node('repo:web', 'repo', null, { branch: 'main', labels: ['front'] }),
      node(WEB, 'package', 'repo:web'),
      node(`${WEB}::file:src/a.ts`, 'file', WEB),
      node('repo:api', 'repo', null, { branch: 'main', labels: ['back'] }),
      node(API, 'package', 'repo:api'),
      node(`${API}::file:src/b.ts`, 'file', API),
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
  const business = TestBed.inject(MapBusiness);
  business.setViewport(1000, 600);
  await business.load();
  return business;
}

const ids = (map: MapBusiness) => map.visibleNodes().map((n) => n.id);

describe('MapBusiness, label filter on a workspace', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });

  afterEach(() => vi.useRealTimers());

  it('shows every repository while no label is chosen', async () => {
    const map = await loaded();
    map.setLevel(0);
    vi.advanceTimersByTime(1000);
    expect(map.labelFilter()).toEqual([]);
    expect(ids(map)).toEqual(expect.arrayContaining(['repo:web', 'repo:api', WEB, API]));
  });

  it('keeps only the repositories with the chosen label, and what they contain', async () => {
    const map = await loaded();
    map.setLevel(1);
    map.setLabelFilter(['back']);
    vi.advanceTimersByTime(1000);
    expect(map.labelFilter()).toEqual(['back']);
    const shown = ids(map);
    expect(shown).toContain('repo:api');
    expect(shown).toContain(API);
    expect(shown.filter((id) => id.startsWith('repo:web'))).toEqual([]);
  });

  it('shows everything again once the filter is cleared', async () => {
    const map = await loaded();
    map.setLevel(1);
    map.setLabelFilter(['back']);
    map.setLabelFilter([]);
    vi.advanceTimersByTime(1000);
    expect(ids(map)).toContain('repo:web');
  });
});
