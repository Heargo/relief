import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { PAGE_RELOAD } from '../../../../core/services/page-reload';
import { ApiRequestError, ReliefApiService } from '../../../../core/services/relief-api.service';
import { MapPageComponent } from './map-page.component';

const META = { repo: 'acme', range: 'main...feat/x', branches: ['main', 'feat/x'], tags: [] };
const SNAPSHOT = {
  graph: { commit: '0123456789abcdef0123456789abcdef01234567', edges: [], nodes: [] },
  meta: {
    adapters: ['ts'],
    cachedFiles: 0,
    commit: '0123456789abcdef0123456789abcdef01234567',
    date: '2026-01-01T00:00:00Z',
    detector: 'workspace',
    ignoredFiles: 0,
    parsedFiles: 1,
    warnings: [],
  },
};

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  settings: vi.fn(),
  recents: vi.fn(),
  openRepo: vi.fn(),
  pickRepoFolder: vi.fn(),
};
const reload = vi.fn();

async function render() {
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [
      ...TEST_PROVIDERS,
      { provide: ReliefApiService, useValue: api },
      { provide: PAGE_RELOAD, useValue: reload },
    ],
  });
  await TestBed.inject(TranslateService).use('en').toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function openFromMenu(fixture: { whenStable(): Promise<unknown> }, el: HTMLElement) {
  byId(el, 'menu-trigger-workspace')?.click();
  await fixture.whenStable();
  byId(el, 'menu-item-open-repo')?.click();
  await fixture.whenStable();
  await fixture.whenStable();
}

describe('MapPageComponent: another repository on an open map (K06 review)', () => {
  beforeEach(() => {
    reload.mockReset();
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.settings.mockReset().mockResolvedValue({});
    api.recents.mockReset().mockResolvedValue([]);
    api.openRepo.mockReset().mockResolvedValue({ ...META, repo: 'other' });
    api.pickRepoFolder.mockReset().mockResolvedValue('/picked/other');
  });

  it('starts the page again so nothing of the previous repository stays', async () => {
    const { fixture, el } = await render();
    await openFromMenu(fixture, el);
    expect(api.openRepo).toHaveBeenCalledExactlyOnceWith('/picked/other');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not start the page again when the folder picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValue(null);
    const { fixture, el } = await render();
    await openFromMenu(fixture, el);
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows the error, and keeps the map, when the repository cannot be opened', async () => {
    api.openRepo.mockRejectedValue(new Error('not a git repository: /picked/other'));
    const { fixture, el } = await render();
    await openFromMenu(fixture, el);
    expect(reload).not.toHaveBeenCalled();
    expect(byId(el, 'open-error')?.textContent).toContain('not a git repository');
    expect(byId(el, 'repo-name')?.textContent?.trim()).toBe('acme');
  });

  it('knows there is no session from the error code, whatever the message', async () => {
    api.meta.mockReset().mockRejectedValue(new ApiRequestError('nothing opened', 'no_session'));
    const { el } = await render();
    expect(byId(el, 'welcome')).not.toBeNull();
    expect(byId(el, 'error')).toBeNull();
  });

  it('keeps showing an error that is not "no session"', async () => {
    api.meta.mockReset().mockRejectedValue(new ApiRequestError('boom', 'index'));
    const { el } = await render();
    expect(byId(el, 'welcome')).toBeNull();
    expect(byId(el, 'error')?.textContent).toContain('boom');
  });
});
