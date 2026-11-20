import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, MetaResponse, NodeChange } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const A = 'pkg:@acme/web::file:src/a.ts';
const B = 'pkg:@acme/web::file:src/b.ts';
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: ['pkg:@acme/web', A, B].map((id) => ({
      id,
      kind: id.includes('::file:') ? 'file' : 'package',
      subkind: 'ts',
      parent: null,
      visibility: 'public',
      contentHash: 'h',
    })),
  },
  meta: {},
};

/** 3 added, 2 modified, 1 removed, 0 moved symbols. */
function diff(): DiffResponse {
  const nodes: NodeChange[] = [];
  const add = (status: 'added' | 'modified' | 'removed', n: number) => {
    for (let i = 0; i < n; i++) {
      const extra = status === 'modified' ? { body: true } : {};
      nodes.push({
        id: `${A}::sym:${status}${i}`,
        status,
        linesAdded: 0,
        linesRemoved: 0,
        ...extra,
      } as NodeChange);
    }
  };
  add('added', 3);
  add('modified', 2);
  add('removed', 1);
  return {
    diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes, edges: [] },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: [],
  };
}

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  reviewState: vi.fn(),
};

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

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('MapPageComponent, left panel like the mockup', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockResolvedValue(diff());
    api.readingOrder.mockReset().mockResolvedValue({
      items: [
        { id: A, reasons: [] },
        { id: B, reasons: [] },
      ],
    });
    api.reviewState.mockReset().mockResolvedValue({ seen: [A] });
  });

  it('opens the panel with the mode switch, a segmented control out of the top bar', async () => {
    const { el } = await render();
    const panel = byId(el, 'left-panel')!;
    const first = panel.firstElementChild as HTMLElement;
    expect(first.classList.contains('sec')).toBe(true);
    const seg = first.querySelector('.seg');
    expect(seg).not.toBeNull();
    expect(seg?.contains(byId(el, 'review-toggle'))).toBe(true);
    expect(seg?.contains(byId(el, 'explore-toggle'))).toBe(true);
    expect(el.querySelector('header.topbar [data-testid="review-toggle"]')).toBeNull();
    expect(el.querySelector('header.topbar [data-testid="explore-toggle"]')).toBeNull();
  });

  it('marks the active mode and switches on click', async () => {
    const { el, fixture } = await render();
    expect(byId(el, 'review-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(el, 'review-toggle')?.classList.contains('on')).toBe(true);
    byId(el, 'explore-toggle')!.click();
    await fixture.whenStable();
    expect(byId(el, 'explore-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(el, 'explore-toggle')?.classList.contains('on')).toBe(true);
    expect(byId(el, 'review-toggle')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('gives every section of the left panel the common section class and an h3', async () => {
    const { el } = await render();
    for (const id of ['pr-card', 'layers-section', 'layout-section', 'reading-order']) {
      const section = byId(el, id);
      expect(section, id).not.toBeNull();
      expect(section?.classList.contains('sec'), id).toBe(true);
    }
    for (const id of ['layers-section', 'layout-section']) {
      expect(byId(el, id)?.querySelector('h3'), id).not.toBeNull();
    }
  });

  it('shows the layout as a segmented control with the on-screen count in the title', async () => {
    const { el } = await render();
    const section = byId(el, 'layout-section')!;
    const seg = section.querySelector('.seg')!;
    expect(seg.contains(byId(el, 'layout-fewer-crossings'))).toBe(true);
    expect(seg.contains(byId(el, 'layout-raw-grid'))).toBe(true);
    expect(byId(el, 'layout-fewer-crossings')?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(el, 'layout-fewer-crossings')?.classList.contains('on')).toBe(true);
    expect(byId(el, 'layout-raw-grid')?.classList.contains('on')).toBe(false);
    expect(section.querySelector('h3')?.contains(byId(el, 'crossings-visible'))).toBe(true);
  });

  it('shows the two layout totals on a single grey line, with their counts', async () => {
    const { el } = await render();
    const section = byId(el, 'layout-section')!;
    const optimized = byId(el, 'crossings-optimized')!;
    const raw = byId(el, 'crossings-raw')!;
    expect(optimized.hasAttribute('data-count')).toBe(true);
    expect(raw.hasAttribute('data-count')).toBe(true);
    const line = optimized.closest('.hint');
    expect(line).not.toBeNull();
    expect(line?.contains(raw)).toBe(true);
    expect(section.querySelectorAll('.hint')).toHaveLength(1);
    expect(section.querySelectorAll('p')).toHaveLength(1);
  });

  it('heads the PR card with the range, with no title and no old section heading', async () => {
    const { el } = await render();
    const card = byId(el, 'pr-card')!;
    expect(byId(el, 'pr-range')?.textContent?.trim()).toBe('main...feat/promo-codes');
    expect(card.querySelector('h3')).toBeNull();
    expect(card.textContent).not.toMatch(/#\d+/);
  });

  it('shows the PR stats as one line of counts with a coloured dot per status', async () => {
    const { el } = await render();
    const stats = byId(el, 'pr-stats')!;
    expect(stats.getAttribute('data-symbols-added')).toBe('3');
    expect(stats.classList.contains('stats')).toBe(true);
    expect(stats.querySelector('.chip')).toBeNull();
    const count = (status: string) =>
      stats.querySelector(`i.dot.${status}`)?.parentElement?.textContent?.replace(/\s+/g, '');
    expect(count('add')).toBe('3');
    expect(count('mod')).toBe('2');
    expect(count('del')).toBe('1');
    // a status with no symbol shows no dot
    expect(stats.querySelector('i.dot.mov')).toBeNull();
  });

  it('shows the review progress as a bar with "N/M seen"', async () => {
    const { el } = await render();
    const bar = byId(el, 'pr-progress')!;
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('2');
    expect(bar.classList.contains('prog')).toBe(true);
    expect(byId(el, 'pr-card')?.textContent).toContain('1/2 seen');
  });

  it('writes the progress in French', async () => {
    const { el } = await render('fr');
    expect(byId(el, 'pr-card')?.textContent).toContain('1/2 vus');
  });
});
