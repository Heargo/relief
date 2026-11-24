import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapBusiness } from '../../business/map.business';
import { MapPageComponent } from './map-page.component';

// K09 review: a failing label call is shown, and a label that no longer exists leaves the filter.

const META: MetaResponse = {
  repo: 'shop',
  range: null,
  branches: [],
  tags: [],
  workspace: { repos: [{ name: 'web', labels: ['front'] }] },
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

describe('MapPageComponent, label errors and stale filter', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue({
      graph: {
        commit: '0123456789abcdef0123456789abcdef01234567',
        edges: [],
        nodes: [
          node('repo:web', 'repo', null, { branch: 'main', labels: ['front'] }),
          node('repo:web/pkg:web', 'package', 'repo:web'),
        ],
      },
      meta: {},
    });
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a', head: 'b', files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.workspaceLabels.mockReset().mockResolvedValue(['front', 'back']);
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

  it('shows the error of a failed labelling', async () => {
    api.setRepoLabels.mockRejectedValue(new Error('unknown label qa'));
    const { fixture, el } = await render();
    byId(el, 'repo-labels-edit')!.click();
    await fixture.whenStable();
    byId(el, 'repo-label-option-back')!.click();
    await fixture.whenStable();
    expect(byId(el, 'open-error')?.textContent).toContain('unknown label qa');
  });

  it('shows why the labels could not be read', async () => {
    api.workspaceLabels.mockRejectedValue(new Error('boom'));
    const { el } = await render();
    expect(byId(el, 'labels-error')?.textContent).toContain('boom');
  });

  it('groups the label controls with an accessible name', async () => {
    const { fixture, el } = await render();
    byId(el, 'repo-labels-edit')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.options')?.getAttribute('aria-label')).toBe('Labels');
    expect(byId(el, 'label-filter')?.querySelector('.seg')?.getAttribute('aria-label')).toBe(
      'Labels',
    );
  });

  it('drops from the active filter a label that no longer exists', async () => {
    const { fixture } = await render();
    const map = fixture.debugElement.injector.get(MapBusiness);
    map.setLabelFilter(['front', 'qa']);
    await fixture.whenStable();
    expect(map.labelFilter()).toEqual(['front']);
  });
});
