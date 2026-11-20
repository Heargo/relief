import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiffResponse,
  EdgeUsagesResponse,
  MetaResponse,
  SnapshotResponse,
} from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

// Contract with the UI (ticket U20), in the panel of an edge:
//  - the API is `ReliefApiService.edgeUsages(from, to, side, range?)`, answering an
//    `EdgeUsagesResponse { supported, total, files: [{ file, usages: [{ binding, line, column,
//    snippet, enclosing }] }] }`; the side is 'head' for an edge that exists at head;
//  - `edge-usages` is the section; for each source file a `usage-file` (`data-file-id`), inside it
//    one `usage-group` per imported symbol (`data-binding`, `usage-group-count` = its number of
//    usages), inside it one `usage-row` (`data-line`) with `usage-line` (the line number),
//    `usage-snippet` (the code line, the identifier wrapped in `usage-mark`) and
//    `usage-enclosing` (the enclosing function);
//  - states: `usage-loading`, `usage-empty` (import only), `usage-unsupported`, `usage-more`
//    ("and N more", N = total - shown);
//  - a click on a row selects the source file (node panel) and marks the line
//    `code-line[data-line]` with `data-focused="true"`.
const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const WEB_FILE = `${WEB}::file:src/a.ts`;
const WEB_FILE_2 = `${WEB}::file:src/d.ts`;
const DB_FILE = `${DB}::file:src/b.ts`;

function node(id: string, kind: string, parent: string | null) {
  return { id, kind, subkind: 'ts', parent, visibility: 'public', contentHash: 'h' };
}
const sym = (file: string, name: string) => `${file}::sym:${name}`;
const call = (from: string, to: string) => ({ from, to, kind: 'calls', precision: 'resolved' });
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const REVIEW = {
  graph: {
    commit: COMMIT,
    nodes: [
      node(WEB, 'package', null),
      node(DB, 'package', null),
      node(WEB_FILE, 'file', WEB),
      node(WEB_FILE_2, 'file', WEB),
      node(DB_FILE, 'file', DB),
      node(sym(WEB_FILE, 's'), 'symbol', WEB_FILE),
      node(sym(WEB_FILE_2, 'r'), 'symbol', WEB_FILE_2),
      node(sym(DB_FILE, 'find'), 'symbol', DB_FILE),
      node(sym(DB_FILE, 'save'), 'symbol', DB_FILE),
    ],
    edges: [
      call(sym(WEB_FILE, 's'), sym(DB_FILE, 'find')),
      call(sym(WEB_FILE_2, 'r'), sym(DB_FILE, 'save')),
    ],
  },
  meta: { adapters: ['ts'], detector: 'workspace', warnings: [] },
} as unknown as SnapshotResponse;

const DIFF: DiffResponse = {
  diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [] },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  renames: [],
};

const usage = (
  binding: string,
  line: number,
  column: number,
  snippet: string,
  enclosing: string | null,
) => ({ binding, line, column, snippet, enclosing });

const USAGES = {
  supported: true,
  total: 4,
  files: [
    {
      file: WEB_FILE,
      usages: [
        usage('find', 3, 9, '  return find(1);', 'load'),
        usage('find', 7, 2, '  find(2);', 'reload'),
        usage('save', 9, 4, '    save(x);', 'Page.run'),
      ],
    },
    { file: WEB_FILE_2, usages: [usage('save', 2, 0, 'save(y);', null)] },
  ],
} as unknown as EdgeUsagesResponse;

const CODE = Array.from({ length: 12 }, (_, i) => `// line ${i + 1}`).join('\n') + '\n';

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
  edgeUsages: vi.fn(),
  openDocs: vi.fn(),
};

async function render(lang: 'en' | 'fr' = 'en') {
  api.snapshot.mockResolvedValue(REVIEW);
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  el.querySelector(`[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
  await fixture.whenStable();
  return { fixture, el };
}

const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (el: HTMLElement, id: string) =>
  Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

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
  api.code.mockReset().mockResolvedValue(CODE);
  api.edgeUsages.mockReset().mockResolvedValue(USAGES);
  api.openDocs.mockReset().mockResolvedValue(undefined);
  document.documentElement.classList.remove('dark');
});

describe('MapPageComponent, the usages of an edge', () => {
  it('asks the API for the usages of the clicked edge, on the head side', async () => {
    await render();
    expect(api.edgeUsages).toHaveBeenCalledTimes(1);
    expect(api.edgeUsages.mock.calls[0].slice(0, 3)).toEqual([WEB, DB, 'head']);
  });

  it('groups them by source file, then by imported symbol, with the count of each', async () => {
    const { el } = await render();
    expect(q(el, 'edge-usages')).not.toBeNull();
    const files = qa(el, 'usage-file');
    expect(files.map((f) => f.dataset['fileId'])).toEqual([WEB_FILE, WEB_FILE_2]);

    const groups = qa(files[0], 'usage-group');
    expect(groups.map((g) => g.dataset['binding'])).toEqual(['find', 'save']);
    expect(groups.map((g) => text(q(g, 'usage-group-count')))).toEqual(['2', '1']);
    expect(qa(files[1], 'usage-group').map((g) => g.dataset['binding'])).toEqual(['save']);
  });

  it('shows the line number, the code line with the symbol highlighted, and the enclosing function', async () => {
    const { el } = await render();
    const rows = qa(qa(el, 'usage-group')[0], 'usage-row');
    expect(rows.map((r) => r.dataset['line'])).toEqual(['3', '7']);
    expect(text(q(rows[0], 'usage-line'))).toBe('3');
    expect(text(q(rows[0], 'usage-snippet'))).toBe('return find(1);');
    expect(text(q(rows[0], 'usage-mark'))).toBe('find');
    expect(text(q(rows[0], 'usage-enclosing'))).toContain('load');

    const save = qa(qa(el, 'usage-group')[1], 'usage-row')[0];
    expect(text(q(save, 'usage-mark'))).toBe('save');
    expect(text(q(save, 'usage-enclosing'))).toContain('Page.run');
  });

  it('omits the enclosing function for a top-level usage', async () => {
    const { el } = await render();
    const top = qa(qa(el, 'usage-file')[1], 'usage-row')[0];
    expect(q(top, 'usage-enclosing')).toBeNull();
  });

  it('opens the code of the source file at the line of the clicked usage', async () => {
    const { fixture, el } = await render();
    qa(qa(el, 'usage-group')[0], 'usage-row')[1].click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(q(el, 'selected-node')?.dataset['nodeId']).toBe(WEB_FILE);
    expect(api.code).toHaveBeenCalledWith(WEB_FILE, 'head');
    const focused = qa(el, 'code-line').filter((l) => l.dataset['focused'] === 'true');
    expect(focused.map((l) => l.dataset['line'])).toEqual(['7']);
  });

  it('says it is loading while the API has not answered', async () => {
    api.edgeUsages.mockReturnValue(new Promise(() => {}));
    const { el } = await render();
    expect(q(el, 'usage-loading')).not.toBeNull();
    expect(q(el, 'usage-row')).toBeNull();
  });

  it('says there is no usage when the symbols are imported but never used', async () => {
    api.edgeUsages.mockResolvedValue({ supported: true, total: 0, files: [] });
    const { el } = await render();
    expect(q(el, 'usage-empty')).not.toBeNull();
    expect(q(el, 'usage-row')).toBeNull();
    expect(q(el, 'usage-unsupported')).toBeNull();
  });

  it('says the language is not supported, in English and in French', async () => {
    api.edgeUsages.mockResolvedValue({ supported: false, total: 0, files: [] });
    const en = await render();
    expect(text(q(en.el, 'usage-unsupported'))).toContain('not supported');
    expect(q(en.el, 'usage-empty')).toBeNull();
    TestBed.resetTestingModule();

    const fr = await render('fr');
    expect(text(q(fr.el, 'usage-unsupported'))).toContain('non pris en charge');
  });

  it('says "and N more" when the cap is reached', async () => {
    api.edgeUsages.mockResolvedValue({ ...USAGES, total: 12 });
    const { el } = await render();
    expect(text(q(el, 'usage-more'))).toContain('and 8 more');
  });

  it('says "et N de plus" in French', async () => {
    api.edgeUsages.mockResolvedValue({ ...USAGES, total: 12 });
    const { el } = await render('fr');
    expect(text(q(el, 'usage-more'))).toContain('et 8 de plus');
  });

  it('shows no "more" line when everything is listed', async () => {
    const { el } = await render();
    expect(q(el, 'usage-more')).toBeNull();
  });
});
