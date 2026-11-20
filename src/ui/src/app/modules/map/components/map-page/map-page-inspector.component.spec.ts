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

// Review graph: web -> db (5 resolved links), api -> db (1 heuristic link, added by the PR).
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';
const WEB_FILE = `${WEB}::file:src/a.ts`;
const DB_FILE = `${DB}::file:src/b.ts`;
const API_FILE = `${API}::file:src/c.ts`;

// Explore graph: one route calling one function, in one file.
const PKG = 'pkg:@acme/shop';
const FILE = `${PKG}::file:src/checkout.ts`;
const ROUTE = `${FILE}::sym:postCheckout`;
const CHARGE = `${FILE}::sym:chargeCustomer`;

function node(id: string, kind: string, parent: string | null, extra: object = {}) {
  return { id, kind, subkind: 'ts', parent, visibility: 'public', contentHash: 'h', ...extra };
}
const sym = (file: string, name: string) => `${file}::sym:${name}`;
const call = (from: string, to: string, precision = 'resolved') => ({
  from,
  to,
  kind: 'calls',
  precision,
});
const meta = { adapters: ['ts'], detector: 'workspace', warnings: [] };
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const REVIEW = {
  graph: {
    commit: COMMIT,
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
    ],
    edges: [
      ...[0, 1, 2, 3, 4].map((i) => call(sym(WEB_FILE, `s${i}`), sym(DB_FILE, `t${i}`))),
      call(sym(API_FILE, 'u'), sym(DB_FILE, 't0'), 'syntactic'),
    ],
  },
  meta,
} as unknown as SnapshotResponse;

const EXPLORE = {
  graph: {
    commit: COMMIT,
    nodes: [
      node(PKG, 'package', null),
      node(FILE, 'file', PKG),
      node(ROUTE, 'symbol', FILE, { entry: true, entryType: 'route', route: 'POST /checkout' }),
      node(CHARGE, 'symbol', FILE),
    ],
    edges: [call(ROUTE, CHARGE)],
  },
  meta,
} as unknown as SnapshotResponse;

const ADDED = {
  from: sym(API_FILE, 'u'),
  to: sym(DB_FILE, 't0'),
  kind: 'calls',
  status: 'added',
  commit: null,
} as EdgeChange;

const DIFF: DiffResponse = {
  diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [ADDED] },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

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
  code: vi.fn(),
  openDocs: vi.fn(),
};

async function render(snapshot: SnapshotResponse, lang: 'en' | 'fr' = 'en') {
  api.snapshot.mockResolvedValue(snapshot);
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

type Fixture = Awaited<ReturnType<typeof render>>['fixture'];

const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (el: HTMLElement, id: string) =>
  Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const badge = (el: HTMLElement) => q(el, 'inspector-badge');
const chips = (el: HTMLElement) =>
  Object.fromEntries(
    qa(el, 'inspector-chip').map((c) => [c.dataset['chip'], c.textContent?.trim() ?? '']),
  );

async function clickEdge(fixture: Fixture, el: HTMLElement, from: string, to: string) {
  el.querySelector(`[data-testid="map-edge"][data-from="${from}"][data-to="${to}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
  await fixture.whenStable();
}

async function pickRoute(fixture: Fixture, el: HTMLElement) {
  q(el, 'explore-toggle')?.click();
  await fixture.whenStable();
  el.querySelector<HTMLElement>(
    `[data-testid="entry-point-row"][data-node-id="${ROUTE}"]`,
  )?.click();
  await fixture.whenStable();
}

beforeEach(() => {
  localStorage.clear();
  api.meta.mockReset().mockResolvedValue(META);
  api.snapshot.mockReset();
  api.diff.mockReset().mockResolvedValue(DIFF);
  api.impact.mockReset().mockRejectedValue(new Error('no impact'));
  api.rules.mockReset().mockRejectedValue(new Error('no rules'));
  api.reviewSummary.mockReset().mockRejectedValue(new Error('no summary'));
  api.readingOrder.mockReset().mockRejectedValue(new Error('no order'));
  api.commitReading.mockReset().mockRejectedValue(new Error('no commits'));
  api.reviewState.mockReset().mockRejectedValue(new Error('no state'));
  api.setReviewState.mockReset().mockResolvedValue(undefined);
  api.code.mockReset().mockResolvedValue('export function f() {}\n');
  api.openDocs.mockReset().mockResolvedValue(undefined);
  document.documentElement.classList.remove('dark');
});

describe('MapPageComponent, the inspector header', () => {
  it('says "Overview" when nothing is selected, and the Explorer invites to click', async () => {
    const { fixture, el } = await render(EXPLORE);
    expect(badge(el)?.dataset['kind']).toBe('none');
    expect(badge(el)?.textContent?.trim()).toBe('Overview');
    expect(q(el, 'inspector-close')).toBeNull();

    q(el, 'explore-toggle')?.click();
    await fixture.whenStable();
    expect(badge(el)?.dataset['kind']).toBe('none');
    expect(q(el, 'right-panel')?.textContent).toContain('Click a node or an edge');
  });

  it('says "Node" with the kind of the selected node, and the cross clears the selection', async () => {
    const { fixture, el } = await render(EXPLORE);
    await pickRoute(fixture, el);
    expect(badge(el)?.dataset['kind']).toBe('node');
    expect(badge(el)?.textContent?.trim()).toBe('Node');
    expect(q(el, 'inspector-subtitle')?.textContent?.trim()).toBe('symbol');

    q(el, 'inspector-close')?.click();
    await fixture.whenStable();
    expect(badge(el)?.dataset['kind']).toBe('none');
    expect(q(el, 'selected-node')).toBeNull();
  });

  it('says "Edge" with the type of the selected edge', async () => {
    const { fixture, el } = await render(REVIEW);
    await clickEdge(fixture, el, WEB, DB);
    expect(badge(el)?.dataset['kind']).toBe('edge');
    expect(badge(el)?.textContent?.trim()).toBe('Edge');
    expect(q(el, 'inspector-subtitle')?.textContent?.trim()).toBe('calls');
    expect(q(el, 'edge-panel')).not.toBeNull();
  });

  it('the cross of an edge clears the selection', async () => {
    const { fixture, el } = await render(REVIEW);
    await clickEdge(fixture, el, WEB, DB);
    q(el, 'inspector-close')?.click();
    await fixture.whenStable();
    expect(badge(el)?.dataset['kind']).toBe('none');
    expect(q(el, 'edge-panel')).toBeNull();
  });

  it("is in French: Nœud, Arête, Vue d'ensemble", async () => {
    const { fixture, el } = await render(REVIEW, 'fr');
    expect(badge(el)?.textContent?.trim()).toBe("Vue d'ensemble");
    await clickEdge(fixture, el, WEB, DB);
    expect(badge(el)?.textContent?.trim()).toBe('Arête');
    q(el, 'inspector-from')?.click();
    await fixture.whenStable();
    expect(badge(el)?.textContent?.trim()).toBe('Nœud');
  });
});

describe('MapPageComponent, the panel of an edge', () => {
  it('shows both ends as buttons, and a click on one selects that node', async () => {
    const { fixture, el } = await render(REVIEW);
    await clickEdge(fixture, el, WEB, DB);
    expect(q(el, 'inspector-from')?.dataset['nodeId']).toBe(WEB);
    expect(q(el, 'inspector-to')?.dataset['nodeId']).toBe(DB);

    q(el, 'inspector-to')?.click();
    await fixture.whenStable();
    expect(badge(el)?.dataset['kind']).toBe('node');
    expect(q(el, 'selected-node')?.dataset['nodeId']).toBe(DB);
    expect(q(el, 'edge-panel')).toBeNull();
  });

  it('shows the type, the precision and the number of links as chips', async () => {
    const { fixture, el } = await render(REVIEW);
    await clickEdge(fixture, el, WEB, DB);
    expect(chips(el)).toEqual({ kind: 'calls', precision: 'resolved', count: '5 links' });
  });

  it('says "added by the PR" on an edge the diff adds, and "heuristic" for a syntactic link', async () => {
    const { fixture, el } = await render(REVIEW);
    await clickEdge(fixture, el, API, DB);
    expect(chips(el)).toEqual({
      kind: 'calls',
      precision: 'heuristic',
      count: '1 link',
      added: 'added by the PR',
    });
  });
});

describe('MapPageComponent, the panel of a node lists its edges', () => {
  it('lists what the node depends on and what uses it, one row per edge', async () => {
    const { fixture, el } = await render(EXPLORE);
    await pickRoute(fixture, el);
    const dependsOn = q(el, 'node-edges-depends-on');
    expect(
      qa(dependsOn!, 'node-edge-row').map((r) => [r.dataset['from'], r.dataset['to']]),
    ).toEqual([[ROUTE, CHARGE]]);
    expect(qa(q(el, 'node-edges-used-by')!, 'node-edge-row')).toHaveLength(0);
  });

  it('a row selects the edge: the badge turns to Edge with its ends', async () => {
    const { fixture, el } = await render(EXPLORE);
    await pickRoute(fixture, el);
    qa(el, 'node-edge-row')[0].click();
    await fixture.whenStable();
    expect(badge(el)?.dataset['kind']).toBe('edge');
    expect(q(el, 'inspector-from')?.dataset['nodeId']).toBe(ROUTE);
    expect(q(el, 'inspector-to')?.dataset['nodeId']).toBe(CHARGE);
  });

  it('after a click on the other end, that node lists the edge as used by', async () => {
    const { fixture, el } = await render(EXPLORE);
    await pickRoute(fixture, el);
    qa(el, 'node-edge-row')[0].click();
    await fixture.whenStable();
    q(el, 'inspector-to')?.click();
    await fixture.whenStable();
    const usedBy = qa(q(el, 'node-edges-used-by')!, 'node-edge-row');
    expect(usedBy.map((r) => [r.dataset['from'], r.dataset['to']])).toEqual([[ROUTE, CHARGE]]);
  });
});
