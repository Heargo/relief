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
const BILLING = `${API}::mod:billing`;
const AUTH = `${API}::mod:auth`;
const INVOICE = `${API}::file:billing/invoice.ts`;
const SESSION = `${API}::file:auth/session.ts`;
const TOTAL = `${INVOICE}::sym:computeTotal`;

const SNAPSHOT: SnapshotResponse = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      node('pkg:acme', 'repo', null),
      node(API, 'service', 'pkg:acme'),
      node(BILLING, 'module', API),
      node(AUTH, 'module', API),
      node(INVOICE, 'file', BILLING),
      node(SESSION, 'file', AUTH),
      node(TOTAL, 'symbol', INVOICE),
    ],
  },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 2,
    warnings: [],
  },
};

async function loaded(): Promise<MapBusiness> {
  const business = TestBed.inject(MapBusiness);
  business.setViewport(1000, 600);
  await business.load();
  return business;
}

function settle(): void {
  vi.advanceTimersByTime(1000);
}

describe('MapBusiness navigation history', () => {
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

  it('has nothing to go back or forward to before any step', async () => {
    const business = await loaded();
    expect(business.canGoBack()).toBe(false);
    expect(business.canGoForward()).toBe(false);
  });

  it('a selection adds a step, and back restores the previous selection', async () => {
    const business = await loaded();
    business.selectNode(INVOICE);
    business.selectNode(SESSION);
    expect(business.canGoBack()).toBe(true);
    business.goBack();
    settle();
    expect(business.selectedNodeId()).toBe(INVOICE);
    expect(business.canGoForward()).toBe(true);
    business.goForward();
    settle();
    expect(business.selectedNodeId()).toBe(SESSION);
    expect(business.canGoForward()).toBe(false);
  });

  it('a framing by search adds a step, and back restores the selection and the camera', async () => {
    const business = await loaded();
    business.selectResult(INVOICE);
    settle();
    const first = business.camera();
    business.selectResult(SESSION);
    settle();
    const second = business.camera();
    expect(second).not.toEqual(first);

    business.goBack();
    settle();
    expect(business.selectedNodeId()).toBe(INVOICE);
    expect(business.camera().scale).toBeCloseTo(first.scale, 3);
    expect(business.camera().tx).toBeCloseTo(first.tx, 1);
    expect(business.camera().ty).toBeCloseTo(first.ty, 1);

    business.goForward();
    settle();
    expect(business.selectedNodeId()).toBe(SESSION);
    expect(business.camera().tx).toBeCloseTo(second.tx, 1);
    expect(business.camera().ty).toBeCloseTo(second.ty, 1);
  });

  it('a link of a panel adds a step', async () => {
    const business = await loaded();
    business.selectNode(INVOICE);
    business.selectLink({
      from: SESSION,
      to: INVOICE,
      kind: 'imports',
      precision: 'exact',
    } as never);
    expect(business.selectedNodeId()).toBe(SESSION);
    business.goBack();
    settle();
    expect(business.selectedNodeId()).toBe(INVOICE);
  });

  it('panning and zooming by hand add no step', async () => {
    const business = await loaded();
    business.selectResult(INVOICE);
    settle();
    business.selectResult(SESSION);
    settle();
    business.pan(40, 20);
    business.zoomAt(1.3, 500, 300);
    settle();
    business.goBack();
    settle();
    // One step back is the first selection, not the pan or the zoom.
    expect(business.selectedNodeId()).toBe(INVOICE);
    expect(business.canGoBack()).toBe(false);
  });

  it('a new selection after a return drops the abandoned branch', async () => {
    const business = await loaded();
    business.selectNode(INVOICE);
    business.selectNode(SESSION);
    business.goBack();
    business.selectNode(TOTAL);
    expect(business.canGoForward()).toBe(false);
    business.goBack();
    settle();
    expect(business.selectedNodeId()).toBe(INVOICE);
  });

  it('restoring a step does not add one', async () => {
    const business = await loaded();
    business.selectNode(INVOICE);
    business.selectNode(SESSION);
    business.goBack();
    business.goForward();
    business.goBack();
    expect(business.selectedNodeId()).toBe(INVOICE);
    expect(business.canGoBack()).toBe(false);
  });

  it('going back or forward at the ends does nothing', async () => {
    const business = await loaded();
    business.selectNode(INVOICE);
    business.goBack();
    business.goForward();
    expect(business.selectedNodeId()).toBe(INVOICE);
  });

  it('a change of range empties the history', async () => {
    const business = await loaded();
    business.selectNode(INVOICE);
    business.selectNode(SESSION);
    expect(business.canGoBack()).toBe(true);
    business.show(SNAPSHOT.graph);
    expect(business.canGoBack()).toBe(false);
    expect(business.canGoForward()).toBe(false);
  });
});
