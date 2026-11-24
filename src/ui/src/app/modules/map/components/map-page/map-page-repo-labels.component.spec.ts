import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

// K09: in a workspace the header shows the labels of each repository and lets one change them; the
// Display section has a filter by label.

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

const snapshot = (web: string[]) => ({
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      node('repo:web', 'repo', null, { branch: 'feat/order-badge', labels: web }),
      node('repo:web/pkg:web', 'package', 'repo:web'),
      node('repo:api', 'repo', null, { branch: 'feat/order-total', labels: ['back'] }),
      node('repo:api/pkg:api', 'package', 'repo:api'),
    ],
  },
  meta: {},
});

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  reviewState: vi.fn(),
  workspaceLabels: vi.fn(),
  setRepoLabels: vi.fn(),
};

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const row = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll<HTMLElement>('[data-testid="workspace-repo"]')].find(
    (r) => r.querySelector('b')?.textContent?.trim() === name,
  ) as HTMLElement;

const chips = (r: HTMLElement) =>
  [...r.querySelectorAll('[data-testid="repo-label"]')].map((c) => c.textContent?.trim());

describe('MapPageComponent, labels of the repositories of a workspace', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(snapshot(['front']));
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a', head: 'b', files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.workspaceLabels.mockReset().mockResolvedValue(['front', 'back', 'ops', 'tools']);
    api.setRepoLabels.mockReset();
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

  it('shows the labels of each repository in the header', async () => {
    const { el } = await render();
    expect(chips(row(el, 'web'))).toEqual(['front']);
    expect(chips(row(el, 'api'))).toEqual(['back']);
  });

  it('adds a label to a repository: the choice goes to the API and the header shows it', async () => {
    api.setRepoLabels.mockImplementation(async () => {
      api.meta.mockResolvedValue({
        ...META,
        workspace: {
          repos: [
            { name: 'web', labels: ['front', 'ops'] },
            { name: 'api', labels: ['back'] },
          ],
        },
      });
      api.snapshot.mockResolvedValue(snapshot(['front', 'ops']));
      return api.meta();
    });
    const { fixture, el } = await render();
    byId(row(el, 'web'), 'repo-labels-edit')!.click();
    await fixture.whenStable();
    const options = [...row(el, 'web').querySelectorAll('[data-testid^="repo-label-option-"]')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['front', 'back', 'ops', 'tools']);
    expect(options.map((o) => o.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    byId(row(el, 'web'), 'repo-label-option-ops')!.click();
    await fixture.whenStable();
    expect(api.setRepoLabels).toHaveBeenCalledWith('web', ['front', 'ops']);
    expect(chips(row(el, 'web'))).toEqual(['front', 'ops']);
  });

  it('removes a label by clicking it again', async () => {
    api.setRepoLabels.mockResolvedValue(META);
    const { fixture, el } = await render();
    byId(row(el, 'web'), 'repo-labels-edit')!.click();
    await fixture.whenStable();
    byId(row(el, 'web'), 'repo-label-option-front')!.click();
    await fixture.whenStable();
    expect(api.setRepoLabels).toHaveBeenCalledWith('web', []);
  });

  it('offers a filter by label in the Display section, off by default', async () => {
    const { fixture, el } = await render();
    const section = byId(el, 'display-section')!;
    const filter = section.querySelector<HTMLElement>('[data-testid="label-filter"]');
    expect(filter).not.toBeNull();
    const front = byId(el, 'label-filter-front')!;
    expect(front.getAttribute('aria-pressed')).toBe('false');
    expect(byId(el, 'label-filter-ops')).not.toBeNull();
    front.click();
    await fixture.whenStable();
    expect(byId(el, 'label-filter-front')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('has no label filter on a single repository', async () => {
    api.meta.mockResolvedValue({ ...META, workspace: undefined });
    const { el } = await render();
    expect(byId(el, 'display-section')).not.toBeNull();
    expect(byId(el, 'label-filter')).toBeNull();
  });
});
