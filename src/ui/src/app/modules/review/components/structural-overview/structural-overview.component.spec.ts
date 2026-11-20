import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ReviewSummary } from '../../../../core/models/contract';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { StructuralOverviewComponent } from './structural-overview.component';

const REFRESH = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';
const REQUIRE_AUTH = 'pkg:@acme/api/routes::file:apps/api/routes/middleware.ts::sym:requireAuth';
const RENEW = 'pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscriptions';
const DISCOUNT = 'pkg:@acme/api/billing::file:apps/api/billing/discount.ts';
const LEGACY = 'pkg:@acme/api/legacy::file:apps/api/legacy.ts';
const MOVED = 'pkg:@acme/api/b::file:apps/api/b.ts';
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';

const SUMMARY = {
  signatures: [
    {
      node: REFRESH,
      breaking: true,
      internal: false,
      directCallers: 3,
      transitiveCallers: 6,
      untestedCallers: 4,
    },
  ],
  violations: [],
  addedFiles: [{ path: 'apps/api/billing/discount.ts', node: DISCOUNT }],
  removedFiles: [{ path: 'apps/api/legacy.ts', node: LEGACY }],
  movedFiles: [{ from: 'apps/api/a.ts', to: 'apps/api/b.ts', node: MOVED }],
  formatOnlyFiles: [
    { path: 'packages/shared/http/client.ts', node: CLIENT, linesAdded: 1, linesRemoved: 1 },
  ],
  outOfDiff: [
    { node: REQUIRE_AUTH, calls: REFRESH, tested: true },
    { node: RENEW, calls: REFRESH, tested: false },
  ],
  couplingsAdded: [],
  couplingsRemoved: [],
} as unknown as ReviewSummary;

async function render(summary: ReviewSummary = SUMMARY, lang: 'en' | 'fr' = 'en') {
  TestBed.configureTestingModule({
    imports: [StructuralOverviewComponent],
    providers: TEST_PROVIDERS,
  });
  await TestBed.inject(TranslateService).use(lang);
  const fixture = TestBed.createComponent(StructuralOverviewComponent);
  fixture.componentRef.setInput('summary', summary);
  const selected: string[] = [];
  fixture.componentInstance.nodeSelect.subscribe((id: string) => selected.push(id));
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, selected };
}

const group = (el: HTMLElement, name: string) =>
  el.querySelector(`[data-testid="overview-group"][data-group="${name}"]`);
const rowOf = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="overview-row"][data-node-id="${id}"]`);

describe('StructuralOverviewComponent', () => {
  it('lists the modified signatures with their direct and transitive callers', async () => {
    const { el } = await render();

    const signatures = group(el, 'signatures');
    expect(signatures?.textContent).toContain('Modified signatures');
    expect(signatures?.textContent).toContain('SessionStore.refresh');
    expect(signatures?.textContent).toContain('breaking');
    expect(signatures?.textContent).toContain('3 direct');
    expect(signatures?.textContent).toContain('6 transitive');
  });

  it.each([
    ['en', 1, 1, '1 direct caller · 1 transitive'],
    ['en', 3, 6, '3 direct callers · 6 transitive'],
    ['fr', 1, 1, '1 appelant direct · 1 transitif'],
    ['fr', 3, 6, '3 appelants directs · 6 transitifs'],
  ] as const)(
    'pluralizes the callers of a signature in %s (%i direct, %i transitive)',
    async (lang, direct, transitive, text) => {
      const summary = {
        ...SUMMARY,
        signatures: [
          {
            node: REFRESH,
            breaking: true,
            internal: false,
            directCallers: direct,
            transitiveCallers: transitive,
            untestedCallers: 0,
          },
        ],
      } as unknown as ReviewSummary;

      const { el } = await render(summary, lang);

      expect(group(el, 'signatures')?.textContent).toContain(text);
    },
  );

  it('lists the callers out of the diff with a tested or untested badge', async () => {
    const { el } = await render();

    const out = group(el, 'out-of-diff');
    expect(out?.textContent).toContain('Out of the diff, calls a breaking signature');
    const auth = rowOf(el, REQUIRE_AUTH);
    const renew = rowOf(el, RENEW);
    expect(auth?.textContent).toContain('requireAuth');
    expect(auth?.querySelector('[data-testid="tested-badge"]')?.getAttribute('data-tested')).toBe(
      'true',
    );
    expect(renew?.textContent).toContain('renewSubscriptions');
    expect(renew?.querySelector('[data-testid="tested-badge"]')?.getAttribute('data-tested')).toBe(
      'false',
    );
    expect(renew?.textContent).toContain('untested');
  });

  it('lists added, removed, moved and format-only files by path', async () => {
    const { el } = await render();

    const files = group(el, 'files')?.textContent ?? '';
    expect(files).toContain('Files added, removed, moved');
    expect(files).toContain('apps/api/billing/discount.ts');
    expect(files).toContain('apps/api/legacy.ts');
    expect(files).toContain('apps/api/a.ts');
    expect(files).toContain('apps/api/b.ts');
    expect(files).toContain('packages/shared/http/client.ts');
  });

  it('leaves the violations group out while there are none', async () => {
    const { el } = await render();

    expect(group(el, 'violations')).toBeNull();
  });

  it('emits the node of the clicked row', async () => {
    const { el, selected } = await render();

    rowOf(el, RENEW)?.click();

    expect(selected).toEqual([RENEW]);
  });

  it.each([
    ['apps/api/billing/discount.ts', DISCOUNT],
    ['apps/api/legacy.ts', LEGACY],
    ['apps/api/b.ts', MOVED],
    ['packages/shared/http/client.ts', CLIENT],
  ])('emits the node of the file row %s as given by the summary', async (path, node) => {
    const { el, selected } = await render();

    el.querySelector<HTMLElement>(`[data-testid="overview-row"][data-path="${path}"]`)?.click();

    expect(selected).toEqual([node]);
  });

  it('is translated in French', async () => {
    const { el } = await render(SUMMARY, 'fr');

    expect(group(el, 'signatures')?.textContent).toContain('Signatures modifiées');
    expect(group(el, 'out-of-diff')?.textContent).toContain(
      'Hors du diff, appelle une signature cassante',
    );
    expect(rowOf(el, RENEW)?.textContent).toContain('sans test');
    expect(rowOf(el, REQUIRE_AUTH)?.textContent).toContain('testé');
  });
});
