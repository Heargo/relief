import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ImpactResponse } from '../../../../core/models/contract';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { ImpactSectionComponent } from './impact-section.component';

const SEED = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';
const A = 'pkg:@acme/api/auth::file:apps/api/auth/guard.ts::sym:requireSession';
const B = 'pkg:@acme/web/shell::file:apps/web/shell/nav.ts::sym:renderNav';
const C = 'pkg:@acme/web/shell::file:apps/web/shell/app.ts::sym:boot';

const reached = (node: string, depth: number, extra: Record<string, unknown> = {}) => ({
  node,
  depth,
  via: [SEED],
  kind: 'calls',
  tested: true,
  outOfDiff: false,
  ...extra,
});

const RESPONSE = {
  reached: [
    reached(A, 1),
    reached(B, 2, { kind: 'http', tested: false, outOfDiff: true }),
    reached(C, 2),
  ],
} as unknown as ImpactResponse;

async function render(
  lang: 'en' | 'fr' = 'en',
  followHttp = true,
  direction: 'callers' | 'dependencies' = 'callers',
) {
  TestBed.configureTestingModule({ imports: [ImpactSectionComponent], providers: TEST_PROVIDERS });
  await TestBed.inject(TranslateService).use(lang);
  const fixture = TestBed.createComponent(ImpactSectionComponent);
  fixture.componentRef.setInput('impact', RESPONSE);
  fixture.componentRef.setInput('direction', direction);
  fixture.componentRef.setInput('followHttp', followHttp);
  const directions: string[] = [];
  fixture.componentInstance.directionChange.subscribe((d: string) => directions.push(d));
  const http: boolean[] = [];
  const selected: string[] = [];
  fixture.componentInstance.followHttpChange.subscribe((v: boolean) => http.push(v));
  fixture.componentInstance.nodeSelect.subscribe((id: string) => selected.push(id));
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, http, selected, directions };
}

const q = (el: HTMLElement, id: string) =>
  Array.from(el.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];

describe('ImpactSectionComponent', () => {
  it('groups the list by depth, in French', async () => {
    const { el } = await render('fr');
    const groups = q(el, 'impact-group');
    expect(groups.map((g) => g.dataset['depth'])).toEqual(['1', '2']);
    expect(groups[0].textContent).toContain('Direct');
    expect(groups[0].textContent).toContain('requireSession');
    expect(groups[1].textContent).toContain('À 2 sauts');
    expect(groups[1].textContent).toContain('renderNav');
    expect(groups[1].textContent).toContain('boot');
  });

  it('labels the first group "Direct" in English', async () => {
    const { el } = await render('en');
    expect(q(el, 'impact-group')[0].textContent).toContain('Direct');
  });

  it('counts the transitive callers and those without tests', async () => {
    const { el } = await render('en');
    const count = q(el, 'impact-count')[0].textContent;
    expect(count).toContain('3 transitive callers');
    expect(count).toContain('1 without test');
  });

  it('marks the rows reached via HTTP, out of the diff, and without a test', async () => {
    const { el } = await render('en');
    const rows = q(el, 'impact-row');
    expect(rows).toHaveLength(3);
    const [direct, http] = rows;
    expect(direct.dataset['http']).toBe('false');
    expect(direct.dataset['outOfDiff']).toBe('false');
    expect(direct.dataset['tested']).toBe('true');
    expect(http.dataset['http']).toBe('true');
    expect(http.dataset['outOfDiff']).toBe('true');
    expect(http.dataset['tested']).toBe('false');
  });

  it('emits the new value when the "via HTTP" box is toggled', async () => {
    const { el, http } = await render('en', true);
    const box = q(el, 'impact-http-toggle')[0];
    (box.querySelector('input') ?? box).click();
    expect(http).toEqual([false]);
  });

  it('selects the node of a row on click', async () => {
    const { el, selected } = await render('en');
    q(el, 'impact-row')[0].click();
    expect(selected).toEqual([A]);
  });

  it('counts transitive dependencies when the direction is dependencies', async () => {
    const { el } = await render('fr', true, 'dependencies');
    expect(q(el, 'impact-count')[0].textContent).toContain('3 dépendances transitives');
  });

  it('emits "dependencies" when the user picks Dépendances', async () => {
    const { el, directions } = await render('fr');
    const options = Array.from(
      el.querySelectorAll(
        '[data-testid="impact-direction"] [data-value], [data-testid="impact-direction"] button, [data-testid="impact-direction"] input',
      ),
    ) as HTMLElement[];
    const pick = options.find(
      (o) => o.dataset['value'] === 'dependencies' || o.textContent?.includes('Dépendances'),
    );
    expect(pick, 'a Dépendances option in impact-direction').toBeDefined();
    pick?.click();
    expect(directions).toEqual(['dependencies']);
  });

  it('renders the direction as a segmented control, the active one on and pressed', async () => {
    const { el } = await render('en', true, 'dependencies');
    const group = q(el, 'impact-direction')[0];
    expect(group.classList.contains('seg')).toBe(true);
    const on = group.querySelector('[data-value="dependencies"]') as HTMLElement;
    const off = group.querySelector('[data-value="callers"]') as HTMLElement;
    expect(on.classList.contains('on')).toBe(true);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(off.classList.contains('on')).toBe(false);
    expect(off.getAttribute('aria-pressed')).toBe('false');
  });
});
