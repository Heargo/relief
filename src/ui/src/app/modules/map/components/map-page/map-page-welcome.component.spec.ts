import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { MapPageComponent } from './map-page.component';

const META = { repo: 'acme', range: 'main...feat/x', branches: ['main', 'feat/x'], tags: [] };

const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      {
        id: 'pkg:@acme/web',
        kind: 'package',
        subkind: 'ts',
        parent: null,
        visibility: 'public',
        contentHash: 'h',
      },
    ],
  },
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
  openDocs: vi.fn(),
  recents: vi.fn(),
  openRepo: vi.fn(),
  pickRepoFolder: vi.fn(),
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

describe('MapPageComponent without a session (K06)', () => {
  beforeEach(() => {
    api.meta.mockReset().mockRejectedValue(new Error('no session'));
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.settings.mockReset().mockResolvedValue({});
    api.openDocs.mockReset().mockResolvedValue(undefined);
    api.recents.mockReset().mockResolvedValue([{ kind: 'repo', path: '/work/acme', name: 'acme' }]);
    api.openRepo.mockReset().mockResolvedValue(META);
    api.pickRepoFolder.mockReset().mockResolvedValue('/picked/repo');
  });

  it('shows the welcome screen, not the error, when there is no session', async () => {
    const { el } = await render();
    expect(byId(el, 'welcome')).not.toBeNull();
    expect(byId(el, 'error')).toBeNull();
    expect(byId(el, 'repo-name')).toBeNull();
  });

  it('opening a recent loads the map in the same page', async () => {
    const { fixture, el } = await render();
    api.meta.mockResolvedValue(META);
    el.querySelectorAll<HTMLElement>('[data-testid="welcome-recent"]')[0]?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(api.openRepo).toHaveBeenCalledExactlyOnceWith('/work/acme');
    expect(byId(el, 'welcome')).toBeNull();
    expect(byId(el, 'repo-name')?.textContent?.trim()).toBe('acme');
  });

  it('Workspace > Open a repository goes through the folder picker', async () => {
    const { fixture, el } = await render();
    api.meta.mockResolvedValue(META);
    byId(el, 'menu-trigger-workspace')?.click();
    await fixture.whenStable();
    byId(el, 'menu-item-open-repo')?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.openRepo).toHaveBeenCalledExactlyOnceWith('/picked/repo');
    expect(byId(el, 'welcome')).toBeNull();
  });

  it('the menu entry of an opened map also picks a folder and opens it', async () => {
    api.meta.mockReset().mockResolvedValue(META);
    const { fixture, el } = await render();
    expect(byId(el, 'welcome')).toBeNull();
    byId(el, 'menu-trigger-workspace')?.click();
    await fixture.whenStable();
    byId(el, 'menu-item-open-repo')?.click();
    await fixture.whenStable();
    expect(api.openRepo).toHaveBeenCalledExactlyOnceWith('/picked/repo');
  });
});
