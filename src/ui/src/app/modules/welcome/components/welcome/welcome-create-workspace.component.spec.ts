import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { WelcomeComponent } from './welcome.component';

// The welcome screen creates a workspace: the folder picker asks for the folder of the workspace,
// `create_workspace` writes `<folder>/.relief/` and `<folder name>.relief.json` there and opens it,
// and the page is told the session started.

const META = { repo: 'acme', range: null, branches: [], tags: [] };

const api = {
  recents: vi.fn(),
  openRepo: vi.fn(),
  openWorkspace: vi.fn(),
  pickRepoFolder: vi.fn(),
  createWorkspace: vi.fn(),
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

describe('WelcomeComponent, create a workspace', () => {
  beforeEach(() => {
    api.recents.mockReset().mockResolvedValue([]);
    api.openRepo.mockReset().mockResolvedValue(META);
    api.openWorkspace.mockReset().mockResolvedValue(META);
    api.pickRepoFolder.mockReset();
    api.createWorkspace.mockReset().mockResolvedValue(META);
  });

  it('offers the action, in English and in French', async () => {
    const en = await render('en');
    expect(byId(en.el, 'welcome-create-workspace')?.textContent?.trim()).toBe(
      'Create a workspace…',
    );
    TestBed.resetTestingModule();
    const fr = await render('fr');
    expect(byId(fr.el, 'welcome-create-workspace')?.textContent?.trim()).toBe(
      'Créer un espace de travail…',
    );
  });

  it('asks for the workspace folder and creates the workspace there, named after the folder', async () => {
    api.pickRepoFolder.mockResolvedValueOnce('/work/space');
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.createWorkspace).toHaveBeenCalledExactlyOnceWith('/work/space', 'space');
    expect(opened()).toBe(1);
  });

  it('does nothing when the folder picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValueOnce(null);
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    expect(api.createWorkspace).not.toHaveBeenCalled();
    expect(opened()).toBe(0);
  });

  it('shows the error of a failed creation and stays on the welcome screen', async () => {
    api.pickRepoFolder.mockResolvedValueOnce('/work/space');
    api.createWorkspace.mockRejectedValue(
      new Error('/work/space/space.relief.json already exists'),
    );
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-create-workspace')?.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(byId(el, 'welcome-error')?.textContent).toContain('already exists');
    expect(opened()).toBe(0);
  });
});
