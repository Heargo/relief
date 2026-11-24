import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { WelcomeComponent } from './welcome.component';

const RECENTS = [
  { kind: 'repo', path: '/work/acme', name: 'acme' },
  { kind: 'workspace', path: '/work/shop/shop.relief.json', name: 'shop' },
];

const META = { repo: 'acme', range: null, branches: ['main'], tags: [] };

const api = {
  recents: vi.fn(),
  openRepo: vi.fn(),
  openWorkspace: vi.fn(),
  pickRepoFolder: vi.fn(),
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

describe('WelcomeComponent', () => {
  beforeEach(() => {
    api.recents.mockReset().mockResolvedValue(RECENTS);
    api.openRepo.mockReset().mockResolvedValue(META);
    api.openWorkspace.mockReset().mockResolvedValue(META);
    api.pickRepoFolder.mockReset().mockResolvedValue('/picked/repo');
  });

  it('shows the welcome screen with its two actions', async () => {
    const { el } = await render();
    expect(byId(el, 'welcome')).not.toBeNull();
    expect(byId(el, 'welcome-open-repo')?.textContent).toContain('Open a repository');
    expect(byId(el, 'welcome-open-workspace')?.textContent).toContain('Open a workspace');
  });

  it('is translated in French', async () => {
    const { el } = await render('fr');
    expect(byId(el, 'welcome-open-repo')?.textContent).toContain('Ouvrir un dépôt');
  });

  it('opens the repository chosen in the folder picker, then tells the page', async () => {
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-open-repo')?.click();
    await fixture.whenStable();
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.openRepo).toHaveBeenCalledExactlyOnceWith('/picked/repo');
    expect(opened()).toBe(1);
  });

  it('does nothing when the folder picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValue(null);
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-open-repo')?.click();
    await fixture.whenStable();
    expect(api.openRepo).not.toHaveBeenCalled();
    expect(opened()).toBe(0);
  });

  it('opens the workspace chosen in the folder picker, then tells the page', async () => {
    const { fixture, el, opened } = await render();
    byId(el, 'welcome-open-workspace')?.click();
    await fixture.whenStable();
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.openWorkspace).toHaveBeenCalledExactlyOnceWith('/picked/repo');
    expect(api.openRepo).not.toHaveBeenCalled();
    expect(opened()).toBe(1);
  });

  it('lists the recent repositories and workspaces', async () => {
    const { el } = await render();
    const rows = [...el.querySelectorAll<HTMLElement>('[data-testid="welcome-recent"]')];
    expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('acme'),
      expect.stringContaining('shop'),
    ]);
    expect(rows[0]?.textContent).toContain('/work/acme');
  });

  it('shows no recent list when there is none', async () => {
    api.recents.mockResolvedValue([]);
    const { el } = await render();
    expect(el.querySelectorAll('[data-testid="welcome-recent"]')).toHaveLength(0);
    expect(byId(el, 'welcome-no-recents')).not.toBeNull();
  });

  it('opens a recent repository on click', async () => {
    const { fixture, el, opened } = await render();
    el.querySelectorAll<HTMLElement>('[data-testid="welcome-recent"]')[0]?.click();
    await fixture.whenStable();
    expect(api.openRepo).toHaveBeenCalledExactlyOnceWith('/work/acme');
    expect(api.pickRepoFolder).not.toHaveBeenCalled();
    expect(opened()).toBe(1);
  });

  it('opens a recent workspace as a workspace', async () => {
    const { fixture, el, opened } = await render();
    el.querySelectorAll<HTMLElement>('[data-testid="welcome-recent"]')[1]?.click();
    await fixture.whenStable();
    expect(api.openWorkspace).toHaveBeenCalledOnce();
    expect(api.openRepo).not.toHaveBeenCalled();
    expect(opened()).toBe(1);
  });

  it('shows the API error when the repository cannot be opened', async () => {
    api.openRepo.mockRejectedValue(new Error('not a git repository: /work/acme'));
    const { fixture, el, opened } = await render();
    el.querySelectorAll<HTMLElement>('[data-testid="welcome-recent"]')[0]?.click();
    await fixture.whenStable();
    expect(byId(el, 'welcome-error')?.textContent).toContain('not a git repository');
    expect(opened()).toBe(0);
  });
});
