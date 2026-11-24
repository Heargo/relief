import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../../../../core/models/contract';
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
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: ['pkg:@acme/web', A].map((id) => ({
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

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  reviewState: vi.fn(),
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

describe('MapPageComponent, workspace header and comparison in the left panel', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [{ id: A, reasons: [] }] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
  });

  it('heads the left panel with the repository name and the current branch, above the mode switch', async () => {
    const { el } = await render();
    const header = byId(el, 'workspace-header')!;
    expect(header).not.toBeNull();
    expect(byId(el, 'left-panel')?.firstElementChild).toBe(header);
    expect(header.contains(byId(el, 'repo-name'))).toBe(true);
    expect(byId(el, 'repo-name')?.textContent?.trim()).toBe('acme-shop');
    expect(header.contains(byId(el, 'ref'))).toBe(true);
    expect(byId(el, 'ref')?.textContent).toContain('feat/promo-codes');
    expect(
      header.compareDocumentPosition(byId(el, 'review-toggle')!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('no longer shows the name and the branch in the top bar', async () => {
    const { el } = await render();
    expect(el.querySelector('header.topbar [data-testid="repo-name"]')).toBeNull();
    expect(el.querySelector('header.topbar [data-testid="ref"]')).toBeNull();
  });

  it('moves the range picker under the mode switch in review mode, out of the top bar', async () => {
    const { el } = await render();
    expect(el.querySelector('header.topbar app-range-picker')).toBeNull();
    const section = byId(el, 'compare-section')!;
    expect(section).not.toBeNull();
    expect(byId(el, 'left-panel')?.contains(section)).toBe(true);
    expect(section.querySelector('app-range-picker')).not.toBeNull();
    expect(byId(el, 'range-base')).not.toBeNull();
    expect(
      byId(el, 'review-toggle')!.compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hides the comparison in explore mode and brings it back in review mode', async () => {
    const { el, fixture } = await render();
    byId(el, 'explore-toggle')!.click();
    await fixture.whenStable();
    expect(byId(el, 'compare-section')).toBeNull();
    expect(byId(el, 'range-base')).toBeNull();
    expect(byId(el, 'workspace-header')).not.toBeNull();
    byId(el, 'review-toggle')!.click();
    await fixture.whenStable();
    expect(byId(el, 'compare-section')).not.toBeNull();
    expect(byId(el, 'range-base')).not.toBeNull();
  });
});
