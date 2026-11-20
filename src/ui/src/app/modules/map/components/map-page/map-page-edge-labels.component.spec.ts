import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiffResponse,
  EdgeChange,
  MetaResponse,
  SnapshotResponse,
} from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
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
const WEB_FILE = `${WEB}::file:src/a.ts`;
const DB_FILE = `${DB}::file:src/b.ts`;
const API_FILE = `${API}::file:src/c.ts`;

function node(id: string, kind: string, parent: string | null) {
  return { id, kind, subkind: 'ts', parent, visibility: 'public', contentHash: 'h' };
}
const sym = (file: string, name: string) => `${file}::sym:${name}`;
const call = (from: string, to: string) => ({ from, to, kind: 'calls', precision: 'exact' });

// web -> db: 5 links; api -> db: 1 link (the only one added in the diff); web -> api: 1 link.
const WEB_DB = [0, 1, 2, 3, 4].map((i) => call(sym(WEB_FILE, `s${i}`), sym(DB_FILE, `t${i}`)));
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes: [
      node(WEB, 'package', null),
      node(DB, 'package', null),
      node(API, 'package', null),
      node(WEB_FILE, 'file', WEB),
      node(DB_FILE, 'file', DB),
      node(API_FILE, 'file', API),
      ...[0, 1, 2, 3, 4].flatMap((i) => [
        node(sym(WEB_FILE, `s${i}`), 'symbol', WEB_FILE),
        node(sym(DB_FILE, `t${i}`), 'symbol', DB_FILE),
      ]),
      node(sym(API_FILE, 'u'), 'symbol', API_FILE),
      node(sym(WEB_FILE, 'v'), 'symbol', WEB_FILE),
    ],
    edges: [
      ...WEB_DB,
      call(sym(API_FILE, 'u'), sym(DB_FILE, 't0')),
      call(sym(WEB_FILE, 'v'), sym(API_FILE, 'u')),
    ],
  },
  meta: { adapters: ['ts'], detector: 'workspace', warnings: [] },
} as unknown as SnapshotResponse;

const ADDED: EdgeChange = {
  from: sym(API_FILE, 'u'),
  to: sym(DB_FILE, 't0'),
  kind: 'calls',
  status: 'added',
  commit: null,
} as EdgeChange;

function diff(): DiffResponse {
  return {
    diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [ADDED] },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: [],
  };
}

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

async function render(lang: 'en' | 'fr' = 'en') {
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function edge(el: HTMLElement, from: string, to: string): Element | null {
  return el.querySelector(`[data-testid="map-edge"][data-from="${from}"][data-to="${to}"]`);
}

describe('MapPageComponent, edge labels like the mockup', () => {
  beforeEach(() => {
    localStorage.clear();
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockResolvedValue(diff());
    api.impact.mockReset().mockRejectedValue(new Error('no impact'));
    api.rules.mockReset().mockRejectedValue(new Error('no rules'));
    api.reviewSummary.mockReset().mockRejectedValue(new Error('no summary'));
    api.readingOrder.mockReset().mockRejectedValue(new Error('no order'));
    api.commitReading.mockReset().mockRejectedValue(new Error('no commits'));
    api.reviewState.mockReset().mockRejectedValue(new Error('no state'));
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    api.openDocs.mockReset().mockResolvedValue(undefined);
  });

  it('draws no circle on the edges, labels are SVG texts', async () => {
    const el = await render();
    const edges = el.querySelector('[data-testid="map-edges"]')!;
    expect(edges.querySelectorAll('[data-testid="map-edge"]').length).toBeGreaterThan(0);
    expect(edges.querySelectorAll('circle')).toHaveLength(0);
    expect(edges.querySelectorAll('rect')).toHaveLength(0);
  });

  it('writes the number of links in a text of the status class on a multi-link edge', async () => {
    const el = await render();
    const text = edge(el, WEB, DB)?.querySelector('text.el');
    expect(text?.textContent?.trim()).toBe('5');
    expect(text?.classList.contains('base')).toBe(true);
  });

  it('writes no label on an edge of a single link without diff', async () => {
    const el = await render();
    expect(edge(el, WEB, API)).not.toBeNull();
    expect(edge(el, WEB, API)?.querySelector('text')?.textContent ?? '').toBe('');
  });

  it('calls an added edge of one link new, in the language of the app', async () => {
    const el = await render('en');
    const text = edge(el, API, DB)?.querySelector('text.el');
    expect(text?.textContent?.trim()).toBe('new');
    expect(text?.classList.contains('add')).toBe(true);
  });

  it('calls it nouveau in French', async () => {
    const el = await render('fr');
    expect(edge(el, API, DB)?.querySelector('text.el')?.textContent?.trim()).toBe('nouveau');
  });

  it('keeps the data attributes of the edges', async () => {
    const el = await render();
    const e = edge(el, WEB, DB);
    expect(e?.getAttribute('data-count')).toBe('5');
    expect(e?.getAttribute('data-status')).toBe('unchanged');
    expect(edge(el, API, DB)?.getAttribute('data-status')).toBe('added');
  });

  it('draws the stroke of the 5-link edge thicker than the single-link one', async () => {
    const el = await render();
    const width = (from: string, to: string) =>
      Number(
        edge(el, from, to)?.parentElement?.querySelector('path.line')?.getAttribute('stroke-width'),
      );
    expect(width(WEB, DB)).toBeCloseTo(1.3 + 0.9 * Math.log2(5), 1);
    expect(width(WEB, API)).toBeCloseTo(1.3, 1);
  });
});
