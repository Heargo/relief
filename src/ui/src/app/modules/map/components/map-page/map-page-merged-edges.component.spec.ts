import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { settleScene } from '../../../../../testing/settle-scene';
import { MapBusiness } from '../../business/map.business';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'big',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};
const node = (id: string, kind: string, parent: string | null) => ({
  id,
  kind,
  subkind: 'ts',
  parent,
  visibility: 'public',
  contentHash: 'h',
});
const PACKAGES = Array.from({ length: 24 }, (_, i) => `pkg:p${i}`);
const file = (pkg: string) => `${pkg}::file:src/a.ts`;
/** 24 packages of one file each, every file calling every other: 552 aggregated edges. */
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes: [
      ...PACKAGES.map((p) => node(p, 'package', null)),
      ...PACKAGES.map((p) => node(file(p), 'file', p)),
    ],
    edges: PACKAGES.flatMap((a) =>
      PACKAGES.filter((b) => b !== a).map((b) => ({
        from: file(a),
        to: file(b),
        kind: 'calls',
        precision: 'exact',
      })),
    ),
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

describe('MapCanvasComponent, many edges on screen', () => {
  beforeEach(() => {
    localStorage.clear();
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    for (const name of [
      'diff',
      'impact',
      'rules',
      'reviewSummary',
      'readingOrder',
      'commitReading',
      'reviewState',
    ] as const) {
      api[name].mockReset().mockRejectedValue(new Error('none'));
    }
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    api.openDocs.mockReset().mockResolvedValue(undefined);
  });

  async function render() {
    TestBed.configureTestingModule({
      imports: [MapPageComponent],
      providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
    });
    await TestBed.inject(TranslateService).use('en').toPromise();
    const fixture = TestBed.createComponent(MapPageComponent);
    const map = fixture.debugElement.injector.get(MapBusiness);
    map.setViewport(1000, 600);
    await fixture.whenStable();
    // jsdom has no layout: the component measured 0 x 0 once rendered.
    map.setViewport(1000, 600);
    await fixture.whenStable();
    await settleScene(fixture);
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, map, root };
  }

  interface SceneEdge {
    from: string;
    to: string;
    merged: boolean;
    selected: boolean;
    mid: { x: number; y: number };
  }
  const edges = () =>
    (window as unknown as { __reliefScene: () => { edges: SceneEdge[] } }).__reliefScene().edges;

  it('draws the unchanged edges as merged ones, with no element per edge', async () => {
    const { root } = await render();
    expect(edges().filter((e) => e.merged)).toHaveLength(552);
    expect(edges().filter((e) => !e.merged)).toHaveLength(0);
    expect(root.querySelectorAll('[data-testid="map-edges-merged"]')).toHaveLength(0);
    expect(root.querySelectorAll('g.edge, [data-testid="map-edge"]')).toHaveLength(0);
    expect(root.querySelectorAll('path.arrow, path.hit')).toHaveLength(0);
  });

  it('selects the edge under a click on a merged one, and draws it in full', async () => {
    const { fixture, map, root } = await render();
    const { mid } = edges().filter((e) => e.merged)[3];
    const init = { bubbles: true, clientX: mid.x, clientY: mid.y, button: 0 };
    root
      .querySelector('[data-testid="map-canvas"]')!
      .dispatchEvent(new MouseEvent('pointerdown', init));
    window.dispatchEvent(new MouseEvent('pointerup', init));
    await fixture.whenStable();

    const picked = map.selectedEdge();
    expect(picked).not.toBeNull();
    // The picked edge leaves the merged set: one full edge, 551 merged ones.
    const full = edges().filter((e) => !e.merged);
    expect(full.map((e) => [e.from, e.to])).toEqual([[picked!.from, picked!.to]]);
    expect(full[0].selected).toBe(true);
    expect(edges().filter((e) => e.merged)).toHaveLength(551);
  });
});
