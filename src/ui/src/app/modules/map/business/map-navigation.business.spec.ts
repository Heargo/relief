import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, Node, NodeKind, SnapshotResponse } from '../../../core/models/contract';
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

const API = 'pkg:@acme/api';
const MODULE = `${API}::mod:billing`;
const FILE = `${API}::file:billing/invoice.ts`;
const SYMBOL = `${FILE}::sym:computeTotal`;

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      node('pkg:acme', 'repo', null),
      node(API, 'service', 'pkg:acme'),
      node(MODULE, 'module', API),
      node(FILE, 'file', MODULE),
      node(SYMBOL, 'symbol', FILE),
      node(`${FILE}::sym:applyDiscount`, 'symbol', FILE),
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

const VIEWPORT = { width: 1000, height: 600 };

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(VIEWPORT.width, VIEWPORT.height);
  await business.load();
  return business;
}

function settle(): void {
  vi.advanceTimersByTime(1000);
}

function labels(business: MapBusiness): string[] {
  return business.breadcrumbs().map((c) => (c.kind === 'level' ? `level ${c.level}` : c.label));
}

describe('MapBusiness navigation', () => {
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

  it('searches the loaded graph by name', async () => {
    const business = await loaded();
    expect(business.search('computeTotal').map((r) => r.id)).toEqual([SYMBOL]);
    expect(business.search('')).toEqual([]);
  });

  it('selecting a symbol result selects it and frames its file', async () => {
    const business = await loaded();
    business.selectResult(SYMBOL);
    settle();
    expect(business.selectedNodeId()).toBe(SYMBOL);
    const file = business.visibleNodes().find((n) => n.id === FILE);
    expect(file).toBeDefined();
    expect(file?.mode).toBe('open');
    expect(file?.x).toBeGreaterThanOrEqual(0);
    expect(file?.y).toBeGreaterThanOrEqual(0);
    expect((file?.x ?? 0) + (file?.w ?? 0)).toBeLessThanOrEqual(VIEWPORT.width);
    expect((file?.y ?? 0) + (file?.h ?? 0)).toBeLessThanOrEqual(VIEWPORT.height);
    expect(business.visibleNodes().find((n) => n.id === SYMBOL)).toBeDefined();
  });

  it('selecting a module result selects it and frames it', async () => {
    const business = await loaded();
    business.selectResult(MODULE);
    settle();
    expect(business.selectedNodeId()).toBe(MODULE);
    expect(business.visibleNodes().find((n) => n.id === MODULE)?.mode).toBe('open');
  });

  it('shows the current level in the breadcrumbs while nothing is selected', async () => {
    const business = await loaded();
    expect(labels(business)).toEqual(['acme-shop', 'level 0']);
    business.setLevel(2);
    settle();
    expect(labels(business)).toEqual(['acme-shop', 'level 2']);
  });

  it('shows the ancestors of the selected node in the breadcrumbs', async () => {
    const business = await loaded();
    business.selectResult(SYMBOL);
    expect(labels(business)).toEqual([
      'acme-shop',
      '@acme/api',
      'billing/',
      'invoice.ts',
      'computeTotal',
    ]);
  });

  it('clicking an ancestor crumb frames that ancestor', async () => {
    const business = await loaded();
    business.selectResult(SYMBOL);
    settle();
    business.selectCrumb({ kind: 'node', id: MODULE, label: 'billing/' });
    settle();
    expect(business.selectedNodeId()).toBe(MODULE);
    expect(labels(business)).toEqual(['acme-shop', '@acme/api', 'billing/']);
    expect(business.visibleNodes().find((n) => n.id === MODULE)?.mode).toBe('open');
  });

  it('clicking the repository crumb shows the whole map', async () => {
    const business = await loaded();
    business.selectResult(SYMBOL);
    settle();
    business.selectCrumb({ kind: 'root', label: 'acme-shop' });
    settle();
    expect(business.level()).toBe(0);
  });

  it('Escape deselects, then goes up one level, then shows everything', async () => {
    const business = await loaded();
    business.selectResult(SYMBOL);
    settle();
    business.setLevel(3);
    settle();

    business.escape();
    settle();
    expect(business.selectedNodeId()).toBeNull();
    expect(business.level()).toBe(3);

    business.escape();
    settle();
    expect(business.level()).toBe(2);

    business.escape();
    settle();
    expect(business.level()).toBe(1);

    business.escape();
    settle();
    expect(business.level()).toBe(0);
  });

  it('Escape closes the help before anything else', async () => {
    const business = await loaded();
    business.selectResult(SYMBOL);
    business.openHelp();
    expect(business.helpOpen()).toBe(true);
    business.escape();
    expect(business.helpOpen()).toBe(false);
    expect(business.selectedNodeId()).toBe(SYMBOL);
  });

  it('toggles the help', async () => {
    const business = await loaded();
    expect(business.helpOpen()).toBe(false);
    business.toggleHelp();
    expect(business.helpOpen()).toBe(true);
    business.toggleHelp();
    expect(business.helpOpen()).toBe(false);
  });
});
