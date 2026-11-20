import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const PKG = 'pkg:@acme/api';
const FILE = `${PKG}::file:src/checkout.ts`;
const ROUTE = `${FILE}::sym:postCheckout`;

function node(id: string, kind: string, parent: string | null, extra: object = {}) {
  return { id, kind, subkind: 'ts', parent, visibility: 'public', contentHash: 'h', ...extra };
}

const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes: [
      node(PKG, 'package', null),
      node(FILE, 'file', PKG),
      node(ROUTE, 'symbol', FILE, { entry: true, entryType: 'route', route: 'POST /checkout' }),
    ],
    edges: [],
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
  metrics: vi.fn(),
  openDocs: vi.fn(),
};

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

/** The test ids found under `root`, in document order, among `ids`. */
function order(root: HTMLElement, ids: string[]): string[] {
  const wanted = ids.map((id) => `[data-testid="${id}"]`).join(',');
  return [...root.querySelectorAll<HTMLElement>(wanted)].map(
    (e) => e.getAttribute('data-testid') ?? '',
  );
}

async function render(lang: 'en' | 'fr' = 'en') {
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function explore(fixture: { whenStable(): Promise<unknown> }, el: HTMLElement) {
  byId(el, 'explore-toggle')!.click();
  await fixture.whenStable();
}

describe('MapPageComponent, left panel: mode tools, then display', () => {
  beforeEach(() => {
    localStorage.clear();
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.rules.mockReset().mockResolvedValue({
      rules: [{ id: 'no-web-to-api', from: 'apps/web/**', deny: 'apps/api/**' }],
      source: 'rules: []',
    });
    api.reviewSummary.mockReset().mockResolvedValue({
      addedFiles: [],
      couplingsAdded: [],
      couplingsRemoved: [],
      formatOnlyFiles: [],
      movedFiles: [],
      outOfDiff: [],
      removedFiles: [],
      signatures: [],
      violations: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [{ id: FILE, reasons: [] }] });
    api.commitReading.mockReset().mockRejectedValue(new Error('no commits'));
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    api.metrics.mockReset().mockRejectedValue(new Error('no metrics'));
    api.impact.mockReset().mockResolvedValue({ reached: [] });
    api.openDocs.mockReset().mockResolvedValue(undefined);
  });

  it('in PR mode, stacks the mode switch, the PR tools, then the display block', async () => {
    const { el } = await render();
    const panel = byId(el, 'left-panel')!;
    expect(panel.firstElementChild?.contains(byId(el, 'review-toggle'))).toBe(true);
    const tools = byId(el, 'tools-section')!;
    const display = byId(el, 'display-section')!;
    expect(tools.parentElement).toBe(panel);
    expect(display.parentElement).toBe(panel);
    expect(order(panel, ['review-toggle', 'tools-section', 'display-section'])).toEqual([
      'review-toggle',
      'tools-section',
      'display-section',
    ]);
    expect(order(tools, ['pr-card', 'reading-order', 'signals-section', 'rules-section'])).toEqual([
      'pr-card',
      'reading-order',
      'signals-section',
      'rules-section',
    ]);
    expect(order(display, ['layers-section', 'layout-section'])).toEqual([
      'layers-section',
      'layout-section',
    ]);
    // nothing of the tools leaks into the display block, nor the reverse
    expect(display.querySelector('[data-testid="pr-card"]')).toBeNull();
    expect(tools.querySelector('[data-testid="layers-section"]')).toBeNull();
    expect(tools.querySelector('[data-testid="layout-section"]')).toBeNull();
  });

  it('in Explorer, stacks the mode switch, the explore tools, then the display block', async () => {
    const { el, fixture } = await render();
    await explore(fixture, el);
    const panel = byId(el, 'left-panel')!;
    const tools = byId(el, 'tools-section')!;
    const display = byId(el, 'display-section')!;
    expect(order(panel, ['explore-toggle', 'tools-section', 'display-section'])).toEqual([
      'explore-toggle',
      'tools-section',
      'display-section',
    ]);
    expect(order(tools, ['entry-points-section', 'hotspots-section', 'rules-section'])).toEqual([
      'entry-points-section',
      'hotspots-section',
      'rules-section',
    ]);
    expect(order(display, ['layers-section', 'layout-section'])).toEqual([
      'layers-section',
      'layout-section',
    ]);
    for (const id of ['pr-card', 'reading-order', 'signals-section']) {
      expect(byId(el, id), id).toBeNull();
    }
  });

  it('leaves out the rules tool when the repository has no rule', async () => {
    api.rules.mockReset().mockResolvedValue({ rules: [], source: null });
    const { el } = await render();
    expect(byId(el, 'tools-section')).not.toBeNull();
    expect(byId(el, 'rules-section')).toBeNull();
  });

  it('shows the diff and focus layers in PR mode only, risk and co-change in Explorer only', async () => {
    const { el, fixture } = await render();
    const display = () => byId(el, 'display-section')!;
    for (const id of ['toggle-diff-layer', 'toggle-focus-layer']) {
      expect(byId(display(), id), id).not.toBeNull();
    }
    expect(byId(display(), 'toggle-co-change-layer')).toBeNull();
    expect(byId(display(), 'toggle-risk-layer')).toBeNull();

    await explore(fixture, el);
    expect(byId(display(), 'toggle-diff-layer')).toBeNull();
    expect(byId(display(), 'toggle-focus-layer')).toBeNull();
    expect(byId(display(), 'toggle-co-change-layer')).not.toBeNull();
  });

  it('keeps impact, unchanged edges, rules and external dependencies in both modes', async () => {
    const { el, fixture } = await render();
    const shared = [
      'toggle-impact-layer',
      'toggle-unchanged-edges',
      'toggle-rules-layer',
      'toggle-hide-external',
    ];
    for (const id of shared) {
      expect(byId(byId(el, 'display-section')!, id), `pr ${id}`).not.toBeNull();
    }
    await explore(fixture, el);
    for (const id of shared) {
      expect(byId(byId(el, 'display-section')!, id), `explore ${id}`).not.toBeNull();
    }
  });

  it('puts the external dependencies switch after the layers and before the layout', async () => {
    const { el } = await render();
    const display = byId(el, 'display-section')!;
    expect(
      order(display, ['toggle-impact-layer', 'toggle-hide-external', 'layout-section']),
    ).toEqual(['toggle-impact-layer', 'toggle-hide-external', 'layout-section']);
  });

  it('titles the blocks with the mockup .ptitle style and the mode name', async () => {
    const { el, fixture } = await render();
    const tools = byId(el, 'tools-section')!;
    const toolsTitle = tools.firstElementChild as HTMLElement;
    expect(toolsTitle.classList.contains('ptitle')).toBe(true);
    expect(toolsTitle.textContent).toContain('Tools');
    const prName = toolsTitle.textContent!.replace(/\s+/g, ' ').trim();

    const displayTitle = byId(el, 'display-section')!.firstElementChild as HTMLElement;
    expect(displayTitle.classList.contains('ptitle')).toBe(true);
    expect(displayTitle.textContent).toContain('Display');

    await explore(fixture, el);
    const exploreName = (byId(el, 'tools-section')!.firstElementChild as HTMLElement)
      .textContent!.replace(/\s+/g, ' ')
      .trim();
    expect(exploreName).toContain('Tools');
    expect(exploreName).not.toBe(prName);
  });

  it('titles the blocks in French', async () => {
    const { el } = await render('fr');
    expect(byId(el, 'tools-section')!.firstElementChild?.textContent).toContain('Outils');
    expect(byId(el, 'display-section')!.firstElementChild?.textContent).toContain('Affichage');
  });
});
