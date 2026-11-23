import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ReviewSummary } from '../../../../core/models/contract';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { StructuralOverviewComponent } from './structural-overview.component';

// R18. In the overview, a group `overview-group[data-group="repeated"]` with one `overview-row`
// per group (`data-repeated` = the representative), reading "4 files: <summary>" ("4 fichiers : …"
// in French), and a `repeated-members-toggle` button (`aria-expanded`) that unfolds the
// `repeated-member` rows (`data-node-id`), one per member; clicking a member selects it.
const F = (n: number) => `pkg:app/src/features::file:src/features/f${n}.ts`;
const HELPERS = 'pkg:app/src/util::file:src/util/helpers.ts';

const SUMMARY = {
  signatures: [],
  violations: [],
  addedFiles: [],
  removedFiles: [],
  movedFiles: [],
  formatOnlyFiles: [],
  outOfDiff: [],
  couplingsAdded: [],
  couplingsRemoved: [],
  repeated: [
    {
      representative: F(1),
      members: [F(1), F(2), F(3), F(4)],
      summary: [{ type: 'edge_added', kind: 'imports', target: HELPERS }],
    },
  ],
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
  const el = fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector<HTMLElement>(sel);
  const qa = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)];
  return { fixture, el, q, qa, selected };
}

const GROUP = '[data-testid="overview-group"][data-group="repeated"]';

describe('StructuralOverviewComponent, repeated changes', () => {
  it('shows one row per group with the number of files and the summary', async () => {
    const { qa } = await render();

    const rows = qa(`${GROUP} [data-testid="overview-row"]`);
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-repeated')).toBe(F(1));
    expect(rows[0].textContent).toContain('4 files:');
    expect(rows[0].textContent).toContain('src/util/helpers.ts');
  });

  it('is in French too', async () => {
    const { qa } = await render(SUMMARY, 'fr');

    expect(qa(`${GROUP} [data-testid="overview-row"]`)[0].textContent).toContain('4 fichiers :');
  });

  it('has no group with an empty list of repeated changes', async () => {
    const { q } = await render({ ...SUMMARY, repeated: [] });

    expect(q(GROUP)).toBeNull();
  });

  it('has no group without repeated changes', async () => {
    const { q } = await render({ ...SUMMARY, repeated: undefined });

    expect(q(GROUP)).toBeNull();
  });

  it('selects the representative when the row is clicked', async () => {
    const { q, selected } = await render();

    q(`${GROUP} [data-testid="overview-row"]`)!.click();

    expect(selected).toEqual([F(1)]);
  });

  it('unfolds the list of the members, which select their node', async () => {
    const { fixture, q, qa, selected } = await render();
    const toggle = q('[data-testid="repeated-members-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(qa('[data-testid="repeated-member"]')).toHaveLength(0);

    toggle.click();
    await fixture.whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const members = qa('[data-testid="repeated-member"]');
    expect(members.map((m) => m.getAttribute('data-node-id'))).toEqual([F(1), F(2), F(3), F(4)]);
    expect(members[1].textContent).toContain('src/features/f2.ts');
    members[1].click();
    expect(selected).toEqual([F(2)]);
  });
});
