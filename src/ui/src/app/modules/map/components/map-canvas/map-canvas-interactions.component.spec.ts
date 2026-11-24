import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { settleScene } from '../../../../../testing/settle-scene';
import { MapBusiness } from '../../business/map.business';
import { MapPageComponent } from '../map-page/map-page.component';

const META: MetaResponse = {
  repo: 'trio',
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
const LONG = 'a-package-whose-name-is-far-too-long-for-its-box';
const PACKAGES = ['pkg:alpha', 'pkg:beta', `pkg:${LONG}`, 'pkg:d', 'pkg:e', 'pkg:f'];
const file = (pkg: string) => `${pkg}::file:src/a.ts`;
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes: [
      ...PACKAGES.map((p) => node(p, 'package', null)),
      ...PACKAGES.map((p) => node(file(p), 'file', p)),
    ],
    edges: [
      { from: file('pkg:alpha'), to: file('pkg:beta'), kind: 'calls', precision: 'exact' },
      { from: file('pkg:beta'), to: file('pkg:d'), kind: 'calls', precision: 'exact' },
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

interface SceneNode {
  id: string;
  label: string;
  labelClipped: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}
interface SceneEdge {
  from: string;
  to: string;
  tooltip: string;
  merged: boolean;
  mid: { x: number; y: number };
}
type Scene = { nodes: SceneNode[]; edges: SceneEdge[] };

describe('MapCanvasComponent, interactions on the canvas', () => {
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
    // These specs read the unchanged edges: the review mode hides them by default.
    localStorage.setItem('relief.unchangedEdges.review', 'true');
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
    const scene = () => (window as unknown as { __reliefScene: () => Scene }).__reliefScene();
    const surface = root.querySelector<HTMLCanvasElement>('[data-testid="map-surface"]')!;
    const stage = root.querySelector<HTMLElement>('[data-testid="map-canvas"]')!;
    // A package is open: its header corner is outside the file it holds.
    const centre = (n: SceneNode) => ({ x: n.left + 4, y: n.top + 4 });
    const packageNode = (id: string) => scene().nodes.find((n) => n.id === id)!;
    /** A press and release at a client point: a click, not a pan. */
    const click = async (at: { x: number; y: number }) => {
      const init = { bubbles: true, clientX: at.x, clientY: at.y, button: 0 };
      stage.dispatchEvent(new MouseEvent('pointerdown', init));
      window.dispatchEvent(new MouseEvent('pointerup', init));
      await fixture.whenStable();
    };
    const hover = async (at: { x: number; y: number }) => {
      surface.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: at.x, clientY: at.y }),
      );
      await fixture.whenStable();
    };
    const key = async (name: string) => {
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
      await fixture.whenStable();
    };
    const tooltips = () => root.querySelectorAll<HTMLElement>('[data-testid="map-tooltip"]');
    return {
      fixture,
      map,
      root,
      scene,
      surface,
      stage,
      centre,
      packageNode,
      click,
      hover,
      key,
      tooltips,
    };
  }

  it('selects the node under a click', async () => {
    const { map, packageNode, centre, click } = await render();
    await click(centre(packageNode('pkg:alpha')));
    expect(map.selectedNodeId()).toBe('pkg:alpha');
  });

  it('selects the edge under a click on its curve', async () => {
    const { map, scene, click } = await render();
    const edge = scene().edges.find((e) => e.from === 'pkg:alpha' && e.to === 'pkg:beta')!;
    await click(edge.mid);
    expect(map.selectedEdge()).toMatchObject({ from: 'pkg:alpha', to: 'pkg:beta' });
  });

  it('deselects on empty ground', async () => {
    const { map, packageNode, centre, click } = await render();
    await click(centre(packageNode('pkg:alpha')));
    expect(map.selectedNodeId()).toBe('pkg:alpha');
    await click({ x: 995, y: 595 });
    expect(map.selectedNodeId()).toBeNull();
  });

  it('dives into the node under a double click', async () => {
    const { map, stage, packageNode, centre } = await render();
    const dive = vi.spyOn(map, 'dive');
    const at = centre(packageNode('pkg:beta'));
    stage.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: at.x, clientY: at.y }),
    );
    expect(dive).toHaveBeenCalledWith('pkg:beta');
  });

  it('shows the tooltip of an edge in one positioned DOM element, not a title', async () => {
    const { root, scene, hover, tooltips, fixture } = await render();
    const edge = scene().edges.find((e) => e.from === 'pkg:alpha' && e.to === 'pkg:beta')!;
    expect(edge.tooltip).not.toBe('');
    await hover(edge.mid);
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].textContent).toContain(edge.tooltip);
    await hover({ x: edge.mid.x + 1, y: edge.mid.y });
    expect(tooltips()).toHaveLength(1);
    expect(root.querySelectorAll('title')).toHaveLength(0);
    await hover({ x: 995, y: 595 });
    expect(tooltips()).toHaveLength(0);
    fixture.destroy();
  });

  it('shows the whole label of a node whose title is cut', async () => {
    const { scene, centre, hover, tooltips } = await render();
    const clipped = scene().nodes.find((n) => n.labelClipped);
    expect(clipped, 'a node with a clipped label').toBeDefined();
    await hover(centre(clipped!));
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].textContent).toContain(clipped!.label);
  });

  it('shows a pointer cursor over what a click selects, and not over empty ground', async () => {
    const { surface, packageNode, centre, scene, hover } = await render();
    await hover(centre(packageNode('pkg:alpha')));
    expect(surface.style.cursor).toBe('pointer');
    const edge = scene().edges[0];
    await hover(edge.mid);
    expect(surface.style.cursor).toBe('pointer');
    await hover({ x: 995, y: 595 });
    expect(surface.style.cursor).not.toBe('pointer');
  });

  it('makes the canvas focusable and named', async () => {
    const { surface } = await render();
    expect(surface.getAttribute('tabindex')).toBe('0');
    expect(surface.getAttribute('aria-label')).toBeTruthy();
  });

  it('announces the selected node in a live region', async () => {
    const { root, packageNode, centre, click } = await render();
    const live = () => root.querySelector<HTMLElement>('[data-testid="map-announce"]')!;
    expect(live().getAttribute('aria-live')).toBe('polite');
    await click(centre(packageNode('pkg:alpha')));
    expect(live().textContent).toContain('alpha');
  });

  it('announces the selected edge in a live region', async () => {
    const { root, scene, click } = await render();
    const edge = scene().edges.find((e) => e.from === 'pkg:alpha' && e.to === 'pkg:beta')!;
    await click(edge.mid);
    const text = root.querySelector('[data-testid="map-announce"]')!.textContent ?? '';
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
  });

  it('clears the selection on Escape', async () => {
    const { map, packageNode, centre, click, key } = await render();
    await click(centre(packageNode('pkg:alpha')));
    await key('Escape');
    expect(map.selectedNodeId()).toBeNull();
  });

  it('dives into the selected node on Enter', async () => {
    const { map, packageNode, centre, click, key } = await render();
    const dive = vi.spyOn(map, 'dive');
    await click(centre(packageNode('pkg:alpha')));
    await key('Enter');
    expect(dive).toHaveBeenCalledWith('pkg:alpha');
  });
});
