import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapBusiness } from '../../business/map.business';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';
const FILE = (pkg: string, name: string): string => `${pkg}::file:src/${name}.ts`;
const node = (id: string, kind: string, parent: string | null) => ({
  id,
  kind,
  subkind: 'ts',
  parent,
  visibility: 'public',
  contentHash: 'h',
});
const call = (from: string, to: string) => ({ from, to, kind: 'calls', precision: 'exact' });
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes: [
      node(WEB, 'package', null),
      node(DB, 'package', null),
      node(API, 'package', null),
      node(FILE(WEB, 'a'), 'file', WEB),
      node(FILE(DB, 'b'), 'file', DB),
      node(FILE(API, 'c'), 'file', API),
    ],
    edges: [
      call(FILE(WEB, 'a'), FILE(DB, 'b')),
      call(FILE(API, 'c'), FILE(DB, 'b')),
      call(FILE(WEB, 'a'), FILE(API, 'c')),
    ],
  },
  meta: { adapters: ['ts'], detector: 'workspace', warnings: [] },
} as unknown as SnapshotResponse;

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  impact: vi.fn(),
  rules: vi.fn(),
  reviewSummary: vi.fn(),
  readingOrder: vi.fn(),
  commitReading: vi.fn(),
  reviewState: vi.fn(),
  setReviewState: vi.fn(),
  openDocs: vi.fn(),
};

/** How many edges the canvas wrote to the DOM since the last call (`relief:edgeWrite` marks). */
function writes(): number {
  const count = performance.getEntriesByName('relief:edgeWrite').length;
  performance.clearMeasures('relief:edgeWrite');
  return count;
}

describe('MapCanvasComponent, edges written only when they changed', () => {
  beforeEach(() => {
    (globalThis as { __reliefPerf?: boolean }).__reliefPerf = true;
    localStorage.clear();
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockRejectedValue(new Error('no diff'));
    api.impact.mockReset().mockRejectedValue(new Error('no impact'));
    api.rules.mockReset().mockRejectedValue(new Error('no rules'));
    api.reviewSummary.mockReset().mockRejectedValue(new Error('no summary'));
    api.readingOrder.mockReset().mockRejectedValue(new Error('no order'));
    api.commitReading.mockReset().mockRejectedValue(new Error('no commits'));
    api.reviewState.mockReset().mockRejectedValue(new Error('no state'));
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    api.openDocs.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (globalThis as { __reliefPerf?: boolean }).__reliefPerf;
    performance.clearMeasures();
  });

  async function render() {
    TestBed.configureTestingModule({
      imports: [MapPageComponent],
      providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
    });
    await TestBed.inject(TranslateService).use('en').toPromise();
    const fixture = TestBed.createComponent(MapPageComponent);
    await fixture.whenStable();
    return { fixture, map: fixture.debugElement.injector.get(MapBusiness) };
  }

  it('writes every edge the first time', async () => {
    await render();
    expect(writes()).toBe(3);
  });

  it('writes no edge when nothing about them changed', async () => {
    const { fixture, map } = await render();
    writes();
    map.setViolations([]);
    await fixture.whenStable();
    expect(writes()).toBe(0);
  });

  it('writes only the edge that gets selected', async () => {
    const { fixture, map } = await render();
    writes();
    map.selectEdge(WEB, DB);
    await fixture.whenStable();
    expect(writes()).toBe(1);
  });
});
