import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ReviewSummary } from '../../../../core/models/contract';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { SignalsSectionComponent } from './signals-section.component';

const REFRESH = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';
const TOTAL = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:computeTotal';

const breaking = (node: string, transitiveCallers: number, untestedCallers: number) => ({
  node,
  breaking: true,
  internal: false,
  directCallers: 1,
  transitiveCallers,
  untestedCallers,
});

function summaryOf(overrides: Record<string, unknown> = {}): ReviewSummary {
  return {
    signatures: [],
    violations: [],
    addedFiles: [],
    removedFiles: [],
    movedFiles: [],
    formatOnlyFiles: [],
    outOfDiff: [],
    couplingsAdded: [],
    couplingsRemoved: [],
    ...overrides,
  } as unknown as ReviewSummary;
}

async function render(summary: ReviewSummary, lang: 'en' | 'fr' = 'en') {
  TestBed.configureTestingModule({
    imports: [SignalsSectionComponent],
    providers: TEST_PROVIDERS,
  });
  await TestBed.inject(TranslateService).use(lang);
  const fixture = TestBed.createComponent(SignalsSectionComponent);
  fixture.componentRef.setInput('summary', summary);
  const selected: string[] = [];
  fixture.componentInstance.nodeSelect.subscribe((id: string) => selected.push(id));
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, selected };
}

const rows = (el: HTMLElement, kind: string) =>
  Array.from(el.querySelectorAll(`[data-testid="signal-row"][data-kind="${kind}"]`));

describe('SignalsSectionComponent', () => {
  it.each([
    [1, 1, '1 transitive caller · 1 without tests'],
    [2, 2, '2 transitive callers · 2 without tests'],
  ])('counts %i transitive callers and %i untested in English', async (n, m, text) => {
    const { el } = await render(summaryOf({ signatures: [breaking(REFRESH, n, m)] }));

    const [row] = rows(el, 'breaking');
    expect(row.textContent).toContain('SessionStore.refresh');
    expect(row.textContent).toContain(text);
  });

  it.each([
    [1, 1, '1 appelant transitif · 1 sans test'],
    [2, 2, '2 appelants transitifs · 2 sans tests'],
  ])('counts %i transitive callers and %i untested in French', async (n, m, text) => {
    const { el } = await render(summaryOf({ signatures: [breaking(REFRESH, n, m)] }), 'fr');

    const [row] = rows(el, 'breaking');
    expect(row.textContent).toContain(text);
  });

  it('does not list a compatible signature as a breaking signal', async () => {
    const compatible = { ...breaking(TOTAL, 2, 0), breaking: false };

    const { el } = await render(summaryOf({ signatures: [compatible] }));

    expect(rows(el, 'breaking')).toHaveLength(0);
  });

  it('shows new and removed couplings between modules', async () => {
    const { el } = await render(
      summaryOf({
        couplingsAdded: [{ from: 'apps/web/components', to: 'packages/db/repos' }],
        couplingsRemoved: [{ from: 'apps/api/routes', to: 'packages/shared/http' }],
      }),
    );

    expect(rows(el, 'new-coupling')[0].textContent).toContain(
      'apps/web/components → packages/db/repos',
    );
    expect(rows(el, 'removed-coupling')[0].textContent).toContain(
      'apps/api/routes → packages/shared/http',
    );
  });

  it('shows the format-only files as ignored', async () => {
    const { el, selected } = await render(
      summaryOf({
        formatOnlyFiles: [
          { path: 'packages/shared/http/client.ts', node: CLIENT, linesAdded: 1, linesRemoved: 1 },
        ],
      }),
    );

    const [row] = rows(el, 'format-only');
    expect(row.textContent).toContain('packages/shared/http/client.ts');
    (row as HTMLElement).click();
    expect(selected).toEqual([CLIENT]);
  });

  it('shows the number of signals next to the title', async () => {
    const { el } = await render(
      summaryOf({
        signatures: [breaking(REFRESH, 2, 1)],
        couplingsAdded: [{ from: 'a', to: 'b' }],
      }),
    );

    expect(el.querySelector('[data-testid="signals-count"]')?.textContent?.trim()).toBe('2');
  });

  it('emits the node of the clicked breaking signature', async () => {
    const { el, selected } = await render(summaryOf({ signatures: [breaking(REFRESH, 2, 1)] }));

    (rows(el, 'breaking')[0] as HTMLElement).click();

    expect(selected).toEqual([REFRESH]);
  });
});
