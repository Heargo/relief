import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

// K10: in a workspace, in review mode, a `repo-comparisons-button` under the mode toggle swaps the
// left panel for a `repo-comparisons-menu`: one `repo-comparison` row per repository, with its
// name (`repo-comparison-name`), then `repo-comparison-source`, "merged into" and
// `repo-comparison-destination` buttons (the K05 selector: each opens the `range-popover` with
// `range-option` rows, the branches of that repository), a `repo-comparison-default` button
// ("Set as default"), and a `repo-comparisons-back` button that brings the normal panel back.
// API: `ReliefApiService.workspaceComparisons()` and
// `ReliefApiService.setRepoComparison(name, source, destination, save)`, both answering the list
// `{ name, source, destination, branches }[]`. Changing a row calls the API for that repository
// only, then the snapshot and the diff are read again.

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

const COMPARISONS = [
  {
    name: 'web',
    source: 'feat/order-badge',
    destination: 'main',
    branches: ['main', 'feat/order-badge'],
  },
  {
    name: 'api',
    source: 'feat/order-total',
    destination: 'main',
    branches: ['main', 'feat/order-total', 'feat/other'],
  },
];

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
  log: vi.fn(),
  workspaceLabels: vi.fn(),
  workspaceComparisons: vi.fn(),
  setRepoComparison: vi.fn(),
};

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const rows = (el: HTMLElement) => [
  ...el.querySelectorAll<HTMLElement>('[data-testid="repo-comparison"]'),
];

const rowOf = (el: HTMLElement, name: string) =>
  rows(el).find(
    (r) => byId(r, 'repo-comparison-name')?.textContent?.trim() === name,
  ) as HTMLElement;

const text = (el: HTMLElement, id: string) => byId(el, id)?.textContent?.trim();

describe('MapPageComponent, comparison of each repository of a workspace', () => {
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
    api.log.mockReset().mockResolvedValue({ entries: [] });
    api.workspaceLabels.mockReset().mockResolvedValue(['front', 'back', 'ops', 'tools']);
    api.workspaceComparisons.mockReset().mockResolvedValue(COMPARISONS);
    api.setRepoComparison
      .mockReset()
      .mockImplementation(async (name, source, destination) =>
        COMPARISONS.map((c) => (c.name === name ? { ...c, source, destination } : c)),
      );
  });

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

  async function openMenu() {
    const view = await render();
    byId(view.el, 'repo-comparisons-button')!.click();
    await view.fixture.whenStable();
    return view;
  }

  it('offers the button under the mode toggle, and no menu yet', async () => {
    const { el } = await render();
    const button = byId(el, 'repo-comparisons-button')!;
    expect(button.textContent?.trim()).toBe('Comparisons per repository');
    const toggle = byId(el, 'review-toggle')!;
    expect(toggle.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(byId(el, 'repo-comparisons-menu')).toBeNull();
  });

  it('is absent on a single repository, present on a workspace', async () => {
    expect(byId((await render()).el, 'repo-comparisons-button')).not.toBeNull();
    TestBed.resetTestingModule();
    api.meta.mockResolvedValue({ ...META, workspace: undefined });
    const { el } = await render();
    expect(byId(el, 'review-toggle')).not.toBeNull();
    expect(byId(el, 'repo-comparisons-button')).toBeNull();
  });

  it('replaces the left panel with one source -> destination row per repository', async () => {
    const { el } = await openMenu();
    expect(byId(el, 'repo-comparisons-menu')).not.toBeNull();
    expect(byId(el, 'workspace-header')).toBeNull();
    expect(byId(el, 'review-toggle')).toBeNull();
    expect(rows(el)).toHaveLength(2);
    const web = rowOf(el, 'web');
    expect(text(web, 'repo-comparison-source')).toBe('feat/order-badge');
    expect(text(web, 'repo-comparison-destination')).toBe('main');
    expect(byId(web, 'repo-comparison-merged-into')?.textContent?.toLowerCase()).toContain(
      'merged into',
    );
    const api_ = rowOf(el, 'api');
    expect(text(api_, 'repo-comparison-source')).toBe('feat/order-total');
    expect(text(api_, 'repo-comparison-destination')).toBe('main');
  });

  it('changes the source of one repository: the API is called for it only, the map is read again', async () => {
    const { el, fixture } = await openMenu();
    const snapshots = api.snapshot.mock.calls.length;
    const diffs = api.diff.mock.calls.length;
    byId(rowOf(el, 'api'), 'repo-comparison-source')!.click();
    await fixture.whenStable();
    expect(byId(el, 'range-popover')).not.toBeNull();
    const options = [...el.querySelectorAll<HTMLElement>('[data-testid="range-option"]')];
    expect(options.map((o) => o.textContent?.trim())).toContain('feat/other');
    expect(options.map((o) => o.textContent?.trim())).not.toContain('feat/order-badge');
    options.find((o) => o.textContent?.trim() === 'feat/other')!.click();
    await fixture.whenStable();
    expect(api.setRepoComparison).toHaveBeenCalledTimes(1);
    expect(api.setRepoComparison).toHaveBeenCalledWith('api', 'feat/other', 'main', false);
    expect(text(rowOf(el, 'api'), 'repo-comparison-source')).toBe('feat/other');
    expect(text(rowOf(el, 'web'), 'repo-comparison-source')).toBe('feat/order-badge');
    expect(api.snapshot.mock.calls.length).toBeGreaterThan(snapshots);
    expect(api.diff.mock.calls.length).toBeGreaterThan(diffs);
  });

  it('changes the destination of one repository from its own button', async () => {
    const { el, fixture } = await openMenu();
    byId(rowOf(el, 'web'), 'repo-comparison-destination')!.click();
    await fixture.whenStable();
    const option = [...el.querySelectorAll<HTMLElement>('[data-testid="range-option"]')].find(
      (o) => o.textContent?.trim() === 'feat/order-badge',
    )!;
    option.click();
    await fixture.whenStable();
    expect(api.setRepoComparison).toHaveBeenCalledWith(
      'web',
      'feat/order-badge',
      'feat/order-badge',
      false,
    );
  });

  it('"Set as default" saves that repository comparison in the workspace file', async () => {
    const { el, fixture } = await openMenu();
    byId(rowOf(el, 'api'), 'repo-comparison-default')!.click();
    await fixture.whenStable();
    expect(api.setRepoComparison).toHaveBeenCalledTimes(1);
    expect(api.setRepoComparison).toHaveBeenCalledWith('api', 'feat/order-total', 'main', true);
  });

  it('brings the normal panel back with the back button', async () => {
    const { el, fixture } = await openMenu();
    byId(el, 'repo-comparisons-back')!.click();
    await fixture.whenStable();
    expect(byId(el, 'repo-comparisons-menu')).toBeNull();
    expect(byId(el, 'workspace-header')).not.toBeNull();
    expect(byId(el, 'review-toggle')).not.toBeNull();
  });

  it('has no menu button in explore mode', async () => {
    const { el, fixture } = await render();
    expect(byId(el, 'repo-comparisons-button')).not.toBeNull();
    byId(el, 'explore-toggle')?.click();
    await fixture.whenStable();
    expect(byId(el, 'repo-comparisons-button')).toBeNull();
  });
});
