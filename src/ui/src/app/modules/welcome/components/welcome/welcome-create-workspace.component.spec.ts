import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { WelcomeComponent } from './welcome.component';

// K13: the welcome screen offers to create a workspace from a repository: the folder picker asks
// for the repository, then for the folder of the workspace; `open_repo_as_workspace` (K07) does
// the rest, and the page is told the session started.

const META = { repo: 'acme', range: null, branches: [], tags: [] };

const api = {
  recents: vi.fn(),
  openRepo: vi.fn(),
  openWorkspace: vi.fn(),
  pickRepoFolder: vi.fn(),
  openRepoAsWorkspace: vi.fn(),
};

async function render(lang: 'en' | 'fr' = 'en') {
  TestBed.configureTestingModule({
    imports: [WelcomeComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(WelcomeComponent);
  let opened = 0;
  fixture.componentInstance.opened.subscribe(() => opened++);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, opened: () => opened };
}

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('WelcomeComponent, create a workspace from a repository (K13)', () => {
  beforeEach(() => {
    api.recents.mockReset().mockResolvedValue([]);
    api.openRepo.mockReset().mockResolvedValue(META);
    api.openWorkspace.mockReset().mockResolvedValue(META);
    api.pickRepoFolder.mockReset();
    api.openRepoAsWorkspace.mockReset().mockResolvedValue(META);
  });

  it('offers the action, in English and in French', async () => {
    const en = await render('en');
    expect(byId(en.el, 'welcome-create-workspace')?.textContent).toContain(
      'Create a workspace from a repository',
    );
    TestBed.resetTestingModule();
    const fr = await render('fr');
    expect(byId(fr.el, 'welcome-create-workspace')?.textContent).toContain(
      'Créer un espace de travail',
    );
  });

  it('asks for the repository, then for the workspace folder, and creates the workspace', async () => {
    api.pickRepoFolder.mockResolvedValueOnce('/work/shop-web').mockResolvedValueOnce('/work/space');
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(api.pickRepoFolder).toHaveBeenCalledTimes(2);
    expect(api.openRepoAsWorkspace).toHaveBeenCalledExactlyOnceWith(
      '/work/shop-web',
      '/work/space',
    );
    expect(opened()).toBe(1);
  });

  it('does nothing when the repository picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValueOnce(null);
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.openRepoAsWorkspace).not.toHaveBeenCalled();
    expect(opened()).toBe(0);
  });

  it('does nothing when the workspace folder picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValueOnce('/work/shop-web').mockResolvedValueOnce(null);
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(api.openRepoAsWorkspace).not.toHaveBeenCalled();
    expect(opened()).toBe(0);
  });

  it('shows the error of a failed creation and stays on the welcome screen', async () => {
    api.pickRepoFolder.mockResolvedValueOnce('/work/shop-web').mockResolvedValueOnce('/work/space');
    api.openRepoAsWorkspace.mockRejectedValue(new Error('the workspace folder is inside the repo'));
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(byId(el, 'welcome-error')?.textContent).toContain('inside the repo');
    expect(opened()).toBe(0);
  });
});
