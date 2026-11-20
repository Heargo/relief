import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
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
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, map, root };
  }

  const merged = (root: HTMLElement) =>
    root.querySelectorAll<SVGPathElement>('[data-testid="map-edges-merged"]');

  it('draws the unchanged edges in one path, with no arrow, label or hit zone', async () => {
    const { root } = await render();
    expect(merged(root)).toHaveLength(1);
    expect((merged(root)[0].getAttribute('d') ?? '').match(/M/g)).toHaveLength(552);
    expect(root.querySelectorAll('g.edge')).toHaveLength(0);
    expect(root.querySelectorAll('[data-testid="map-edge"]')).toHaveLength(0);
    expect(root.querySelectorAll('path.arrow, path.hit')).toHaveLength(0);
  });

  it('selects the edge under a click on the common path, and draws it in full', async () => {
    const { fixture, map, root } = await render();
    const target = map.mergedEdgeLines()[3];
    // Middle of the quadratic curve `M x0,y0 Q cx,cy x1,y1`, in world units.
    const [x0, y0, cx, cy, x1, y1] = (target.shape.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const { scale, tx, ty } = map.camera();
    const world = { x: (x0 + 2 * cx + x1) / 4, y: (y0 + 2 * cy + y1) / 4 };
    merged(root)[0].dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: world.x * scale + tx,
        clientY: world.y * scale + ty,
      }),
    );
    await fixture.whenStable();
    expect(map.selectedEdge()).toMatchObject({ from: target.edge.from, to: target.edge.to });
    expect(
      root.querySelectorAll(
        `[data-testid="map-edge"][data-from="${target.edge.from}"][data-to="${target.edge.to}"]`,
      ),
    ).toHaveLength(1);
    expect((merged(root)[0].getAttribute('d') ?? '').match(/M/g)).toHaveLength(551);
  });
});
