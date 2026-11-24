import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

// Contract with the UI (ticket K05): the comparison of the left panel reads like a PR,
//  - `compare-source` (button, text = source ref, "Working tree" for WORKTREE), then
//    `compare-merged-into` (text "merged into"), then `compare-destination` (button, text =
//    destination ref), in this order, inside `compare-section`;
//  - each button opens the `range-popover` (rows `range-option`, as before) and picking a row
//    sets the range `destination...source` (a working-tree source gives the range `destination`);
//  - `compare-default` ("Set as default") calls `ReliefApiService.setSettings({ source, destination })`;
//  - when the server opened without a range, `ReliefApiService.settings()` gives the sides.

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes', 'feat/other'],
  tags: [],
};

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  reviewState: vi.fn(),
  log: vi.fn(),
  settings: vi.fn(),
  setSettings: vi.fn(),
};

async function render() {
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use('en').toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: HTMLElement, id: string) => byId(el, id)?.textContent?.trim();

describe('MapPageComponent, PR-style comparison (source merged into destination)', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue({
      graph: { commit: '0'.repeat(40), edges: [], nodes: [] },
      meta: {},
    });
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.log.mockReset().mockResolvedValue({ entries: [] });
    api.settings.mockReset().mockResolvedValue({ source: 'WORKTREE', destination: 'main' });
    api.setSettings.mockReset().mockResolvedValue(undefined);
  });

  it('shows the source, then "merged into", then the destination', async () => {
    const { el } = await render();
    const section = byId(el, 'compare-section')!;
    expect(text(el, 'compare-source')).toBe('feat/promo-codes');
    expect(text(el, 'compare-destination')).toBe('main');
    expect(text(el, 'compare-merged-into')?.toLowerCase()).toContain('merged into');
    const follows = (a: string, b: string) =>
      !!(byId(el, a)!.compareDocumentPosition(byId(el, b)!) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(section.contains(byId(el, 'compare-source'))).toBe(true);
    expect(follows('compare-source', 'compare-merged-into')).toBe(true);
    expect(follows('compare-merged-into', 'compare-destination')).toBe(true);
  });

  it('without a range, takes the sides from the settings: working tree merged into main', async () => {
    api.meta.mockResolvedValue({ ...META, range: null });
    const { el } = await render();
    expect(api.settings).toHaveBeenCalled();
    expect(text(el, 'compare-source')).toBe('Working tree');
    expect(text(el, 'compare-destination')).toBe('main');
  });

  it('reads the range destination...source when the source is picked', async () => {
    const { el, fixture } = await render();
    byId(el, 'compare-source')!.click();
    await fixture.whenStable();
    expect(byId(el, 'range-popover')).not.toBeNull();
    const row = [...el.querySelectorAll<HTMLElement>('[data-testid="range-option"]')].find(
      (r) => r.textContent?.trim() === 'feat/other',
    )!;
    row.click();
    await fixture.whenStable();
    expect(text(el, 'compare-source')).toBe('feat/other');
    expect(text(el, 'compare-destination')).toBe('main');
    expect(api.diff.mock.calls.at(-1)?.[0]).toBe('main...feat/other');
  });

  it('changes the destination from its own button', async () => {
    const { el, fixture } = await render();
    byId(el, 'compare-destination')!.click();
    await fixture.whenStable();
    const row = [...el.querySelectorAll<HTMLElement>('[data-testid="range-option"]')].find(
      (r) => r.textContent?.trim() === 'feat/other',
    )!;
    row.click();
    await fixture.whenStable();
    expect(text(el, 'compare-destination')).toBe('feat/other');
    expect(api.diff.mock.calls.at(-1)?.[0]).toBe('feat/other...feat/promo-codes');
  });

  it('"Set as default" saves the source and the destination through the API', async () => {
    const { el, fixture } = await render();
    byId(el, 'compare-default')!.click();
    await fixture.whenStable();
    expect(api.setSettings).toHaveBeenCalledTimes(1);
    expect(api.setSettings).toHaveBeenCalledWith({
      source: 'feat/promo-codes',
      destination: 'main',
    });
  });
});
