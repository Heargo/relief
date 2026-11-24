import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

// K08: in a workspace the header lists the repositories with their branch, and the single
// comparison (one range for all) is not shown.

const META: MetaResponse = {
  repo: 'shop',
  range: null,
  branches: [],
  tags: [],
  workspace: {
    repos: [
      { name: 'web', labels: ['front'] },
      { name: 'api', labels: ['back'] },
    ],
  },
};

const node = (id: string, kind: string, parent: string | null, extra = {}) => ({
  id,
  kind,
  subkind: 'x',
  parent,
  visibility: 'public',
  contentHash: 'h',
  ...extra,
});

const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      node('repo:web', 'repo', null, { branch: 'feat/order-badge', labels: ['front'] }),
      node('repo:web/pkg:web', 'package', 'repo:web'),
      node('repo:api', 'repo', null, { branch: 'feat/order-total', labels: ['back'] }),
      node('repo:api/pkg:api', 'package', 'repo:api'),
    ],
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

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('MapPageComponent, left panel of a workspace', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a', head: 'b', files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
  });

  async function render() {
    TestBed.configureTestingModule({
      imports: [MapPageComponent],
      providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
    });
    await TestBed.inject(TranslateService).use('en').toPromise();
    const fixture = TestBed.createComponent(MapPageComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the workspace, then lists each repository with its branch, not WORKTREE', async () => {
    const el = await render();
    expect(byId(el, 'repo-name')?.textContent?.trim()).toBe('shop');
    const rows = [...el.querySelectorAll('[data-testid="workspace-repo"]')].map((r) =>
      r.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['webfeat/order-badge', 'apifeat/order-total']);
    expect(byId(el, 'ref')).toBeNull();
    expect(byId(el, 'workspace-header')?.textContent).not.toContain('WORKTREE');
  });

  it('hides the single comparison, in review mode too', async () => {
    const el = await render();
    expect(byId(el, 'review-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(el, 'compare-section')).toBeNull();
  });
});
