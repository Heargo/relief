import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, GraphSnapshot, NodeChange } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { DiffPanelComponent } from './diff-panel.component';

const SESSION = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts';
const REFRESH = `${SESSION}::sym:SessionStore.refresh`;
const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const TOTAL = `${INVOICE}::sym:computeTotal`;
const RENDER = `${INVOICE}::sym:renderInvoice`;
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';
const TOTAL_RS = 'pkg:tools::file:tools/total.rs';
const RANGE = 'main...feat/promo-codes';

/** A reason code as the API serializes it (the contract type is generated). */
const reasonCode = (code: string, param?: string) =>
  ({ code, ...(param ? { param } : {}) }) as never;

const change = (c: Partial<NodeChange> & { id: string; status: NodeChange['status'] }) =>
  ({ linesAdded: 0, linesRemoved: 0, ...c }) as NodeChange;

function diffOf(
  nodes: NodeChange[],
  files: { path: string; linesAdded: number; linesRemoved: number }[] = [],
  formatOnlyPaths: string[] = [],
): DiffResponse {
  return {
    diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files, nodes, edges: [] },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: [],
    ...({ formatOnlyPaths } as object),
  };
}

const refreshChange = (internal: boolean, reason = reasonCode('returnWidenedNull')) =>
  change({
    id: REFRESH,
    status: 'modified',
    body: true,
    signature: {
      before: 'async refresh(token: string): Promise<Session>',
      after: 'async refresh(token: string): Promise<Session | null>',
      breaking: true,
      internal,
      reason,
    },
  });

const REFRESH_BASE = 'async refresh(token: string): Promise<Session> {\n  return load(token);\n}';
const REFRESH_HEAD =
  'async refresh(token: string): Promise<Session | null> {\n  return load(token);\n}';

const TEXTS: Record<string, string> = {
  [`${REFRESH}|base`]: REFRESH_BASE,
  [`${REFRESH}|head`]: REFRESH_HEAD,
  [`${TOTAL}|base`]: 'function computeTotal(lines) {\n  return sum(lines);\n}',
  [`${TOTAL}|head`]: 'function computeTotal(lines, discount) {\n  return sum(lines);\n}',
  [`${RENDER}|head`]: 'function renderInvoice() {\n  return 1;\n}',
  [`${CLIENT}|base`]: 'const a = {b:1};\nconst c = 2;',
  [`${CLIENT}|head`]: 'const a = { b: 1 };\nconst c = 2;',
  [`${TOTAL_RS}|base`]: 'fn total() -> u32 {\n    1 + 1\n}',
  [`${TOTAL_RS}|head`]: 'fn total() -> u32 {\n    1 * 1\n}',
};

const api = { code: vi.fn() };

async function render(
  diff: DiffResponse,
  nodeId: string,
  options: {
    lang?: 'en' | 'fr';
    wide?: boolean;
    baseGraph?: GraphSnapshot;
    headGraph?: GraphSnapshot;
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [DiffPanelComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService)
    .use(options.lang ?? 'en')
    .toPromise();
  const fixture = TestBed.createComponent(DiffPanelComponent);
  fixture.componentRef.setInput('diff', diff);
  fixture.componentRef.setInput('nodeId', nodeId);
  fixture.componentRef.setInput('range', RANGE);
  fixture.componentRef.setInput('wide', options.wide ?? false);
  fixture.componentRef.setInput('baseGraph', options.baseGraph ?? null);
  fixture.componentRef.setInput('headGraph', options.headGraph ?? null);
  const toggled = vi.fn();
  fixture.componentInstance.toggleWide.subscribe(toggled);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, toggled };
}

const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (el: HTMLElement, id: string) =>
  Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const text = (e: HTMLElement | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const lines = (el: HTMLElement) =>
  all(el, 'diff-line').map((l) => [
    l.dataset['kind'],
    l.dataset['oldLine'] ?? '',
    l.dataset['newLine'] ?? '',
    text(q(l, 'diff-line-text')),
  ]);

describe('DiffPanelComponent', () => {
  beforeEach(() => {
    api.code
      .mockReset()
      .mockImplementation(async (node: string, side: string) => TEXTS[`${node}|${side}`] ?? '');
  });

  it('shows the unified diff of a symbol with line numbers', async () => {
    const { el } = await render(diffOf([refreshChange(false)]), REFRESH);
    expect(lines(el)).toEqual([
      ['removed', '1', '', 'async refresh(token: string): Promise<Session> {'],
      ['added', '', '1', 'async refresh(token: string): Promise<Session | null> {'],
      ['context', '2', '2', 'return load(token);'],
      ['context', '3', '3', '}'],
    ]);
  });

  it('numbers the lines of a symbol with the lines of its file, on each side', async () => {
    const graphWith = (startLine: number): GraphSnapshot => ({
      commit: 'c',
      edges: [],
      nodes: [
        {
          id: REFRESH,
          kind: 'symbol',
          subkind: 'method',
          parent: null,
          visibility: 'public',
          contentHash: 'h',
          span: { startLine, endLine: startLine + 2 },
        },
      ],
    });
    const { el } = await render(diffOf([refreshChange(false)]), REFRESH, {
      baseGraph: graphWith(15),
      headGraph: graphWith(17),
    });
    expect(lines(el).map((l) => [l[0], l[1], l[2]])).toEqual([
      ['removed', '15', ''],
      ['added', '', '17'],
      ['context', '16', '18'],
      ['context', '17', '19'],
    ]);
  });

  it('reads the code of the chosen range', async () => {
    await render(diffOf([refreshChange(false)]), REFRESH);
    expect(api.code).toHaveBeenCalledWith(REFRESH, 'base', RANGE);
    expect(api.code).toHaveBeenCalledWith(REFRESH, 'head', RANGE);
  });

  it('shows a breaking signature with before, after, reason and public API', async () => {
    const { el } = await render(diffOf([refreshChange(false)]), REFRESH);
    const sig = q(el, 'diff-signature');
    expect(text(q(sig as HTMLElement, 'signature-before'))).toContain(
      'async refresh(token: string): Promise<Session>',
    );
    expect(text(q(sig as HTMLElement, 'signature-after'))).toContain(
      'async refresh(token: string): Promise<Session | null>',
    );
    const badge = q(sig as HTMLElement, 'signature-badge');
    expect(badge?.dataset['breaking']).toBe('true');
    expect(text(badge)).toBe('breaking');
    expect(text(q(sig as HTMLElement, 'signature-reason'))).toBe(
      'Return type widened (null possible)',
    );
    expect(text(q(sig as HTMLElement, 'signature-visibility'))).toBe('public API');
  });

  it('shows the signature texts in French, with the translated reason', async () => {
    const { el } = await render(diffOf([refreshChange(true)]), REFRESH, { lang: 'fr' });
    expect(text(q(el, 'signature-badge'))).toBe('cassante');
    expect(text(q(el, 'signature-reason'))).toBe('Type de retour élargi (null possible)');
    expect(text(q(el, 'signature-visibility'))).toBe('interne');
  });

  it('puts the parameter name in a translated reason, in English and French', async () => {
    const reason = reasonCode('paramRequiredAdded', 'discount');
    const en = await render(diffOf([refreshChange(false, reason)]), REFRESH);
    expect(text(q(en.el, 'signature-reason'))).toBe('Required parameter added (discount)');
    TestBed.resetTestingModule();
    const fr = await render(diffOf([refreshChange(false, reason)]), REFRESH, { lang: 'fr' });
    expect(text(q(fr.el, 'signature-reason'))).toBe('Paramètre obligatoire ajouté (discount)');
  });

  it('shows a compatible signature as compatible', async () => {
    const compatible = change({
      id: REFRESH,
      status: 'modified',
      body: false,
      signature: {
        before: 'f(a)',
        after: 'f(a, b?)',
        breaking: false,
        internal: false,
        reason: reasonCode('paramOptionalAdded'),
      },
    });
    const { el } = await render(diffOf([compatible]), REFRESH);
    const badge = q(el, 'signature-badge');
    expect(badge?.dataset['breaking']).toBe('false');
    expect(text(badge)).toBe('compatible');
    expect(text(q(el, 'signature-reason'))).toBe('Optional parameter added');
  });

  it('shows no signature block for a symbol whose signature did not change', async () => {
    const { el } = await render(
      diffOf([change({ id: TOTAL, status: 'modified', body: true })]),
      TOTAL,
    );
    expect(q(el, 'diff-signature')).toBeNull();
  });

  it('shows an added symbol with only added lines', async () => {
    const { el } = await render(diffOf([change({ id: RENDER, status: 'added' })]), RENDER);
    expect(lines(el).map((l) => l[0])).toEqual(['added', 'added', 'added']);
  });

  it('shows one block per changed symbol of a file, with its status', async () => {
    const diff = diffOf([
      change({ id: TOTAL, status: 'modified', body: true }),
      change({ id: RENDER, status: 'added' }),
    ]);
    const { el } = await render(diff, INVOICE);
    const blocks = all(el, 'diff-block');
    expect(blocks.map((b) => [b.dataset['nodeId'], b.dataset['status']])).toEqual([
      [TOTAL, 'modified'],
      [RENDER, 'added'],
    ]);
    expect(text(blocks[0])).toContain('computeTotal(lines, discount)');
  });

  it('has an expand button in the header that asks to widen the panel', async () => {
    const { el, toggled } = await render(diffOf([refreshChange(false)]), REFRESH);
    const button = q(el, 'diff-expand');
    expect(text(button)).toBe('expand');
    button?.click();
    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it('labels the expand button in French', async () => {
    const { el } = await render(diffOf([refreshChange(false)]), REFRESH, { lang: 'fr' });
    expect(text(q(el, 'diff-expand'))).toBe('élargir');
  });

  it('labels the expand button "collapse" once the panel is wide, in English', async () => {
    const { el } = await render(diffOf([refreshChange(false)]), REFRESH, { wide: true });
    expect(q(el, 'diff-expand')?.getAttribute('aria-pressed')).toBe('true');
    expect(text(q(el, 'diff-expand'))).toBe('collapse');
  });

  it('labels the expand button "réduire" once the panel is wide, in French', async () => {
    const { el } = await render(diffOf([refreshChange(false)]), REFRESH, {
      lang: 'fr',
      wide: true,
    });
    expect(text(q(el, 'diff-expand'))).toBe('réduire');
  });

  describe('format-only file', () => {
    const formatOnly = (added: number, removed: number) =>
      diffOf(
        [],
        [{ path: 'packages/shared/http/client.ts', linesAdded: added, linesRemoved: removed }],
        ['packages/shared/http/client.ts'],
      );

    it('hides the text diff and says how many lines are hidden', async () => {
      const { el } = await render(formatOnly(29, 29), CLIENT);
      expect(lines(el)).toEqual([]);
      expect(text(q(el, 'diff-format-only'))).toBe(
        '58 text diff lines hidden: only the formatting changes',
      );
    });

    it('uses the singular for 1 hidden line, in English', async () => {
      const { el } = await render(formatOnly(1, 0), CLIENT);
      expect(text(q(el, 'diff-format-only'))).toBe(
        '1 text diff line hidden: only the formatting changes',
      );
    });

    it('uses the plural for 2 hidden lines, in English', async () => {
      const { el } = await render(formatOnly(1, 1), CLIENT);
      expect(text(q(el, 'diff-format-only'))).toBe(
        '2 text diff lines hidden: only the formatting changes',
      );
    });

    it('uses the singular for 1 hidden line, in French', async () => {
      const { el } = await render(formatOnly(0, 1), CLIENT, { lang: 'fr' });
      expect(text(q(el, 'diff-format-only'))).toBe(
        '1 ligne de diff texte masquée : seul le formatage change',
      );
    });

    it('uses the plural for 2 hidden lines, in French', async () => {
      const { el } = await render(formatOnly(1, 1), CLIENT, { lang: 'fr' });
      expect(text(q(el, 'diff-format-only'))).toBe(
        '2 lignes de diff texte masquées : seul le formatage change',
      );
    });

    it('shows the text diff anyway after a click on the button', async () => {
      const { fixture, el } = await render(formatOnly(1, 1), CLIENT);
      q(el, 'diff-show-anyway')?.click();
      await fixture.whenStable();
      expect(lines(el)).toEqual([
        ['removed', '1', '', 'const a = {b:1};'],
        ['added', '', '1', 'const a = { b: 1 };'],
        ['context', '2', '2', 'const c = 2;'],
      ]);
    });
  });
  describe('changed file without changed symbol, not format-only', () => {
    const textChange = () =>
      diffOf([], [{ path: 'tools/total.rs', linesAdded: 1, linesRemoved: 1 }], []);

    it('shows the text diff of the whole file without any click', async () => {
      const { el } = await render(textChange(), TOTAL_RS);
      expect(q(el, 'diff-format-only')).toBeNull();
      expect(q(el, 'diff-show-anyway')).toBeNull();
      expect(lines(el)).toEqual([
        ['context', '1', '1', 'fn total() -> u32 {'],
        ['removed', '2', '', '1 + 1'],
        ['added', '', '2', '1 * 1'],
        ['context', '3', '3', '}'],
      ]);
    });

    it('does not hide it when another file is the format-only one', async () => {
      const diff = diffOf(
        [],
        [
          { path: 'tools/total.rs', linesAdded: 1, linesRemoved: 1 },
          { path: 'packages/shared/http/client.ts', linesAdded: 1, linesRemoved: 1 },
        ],
        ['packages/shared/http/client.ts'],
      );
      const { el } = await render(diff, TOTAL_RS);
      expect(q(el, 'diff-format-only')).toBeNull();
      expect(all(el, 'diff-line')).toHaveLength(4);
    });
  });
});
