import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};

function snapshot(nodeIds: string[]): SnapshotResponse {
  return {
    graph: {
      commit: '0123456789abcdef0123456789abcdef01234567',
      edges: [],
      nodes: nodeIds.map((id) => ({
        id,
        kind: id.includes('::file:') ? 'file' : 'package',
        subkind: 'ts',
        parent: null,
        visibility: 'public',
        contentHash: 'h',
      })),
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
}

function snapshotWith(over: Partial<SnapshotResponse['meta']>): SnapshotResponse {
  const base = snapshot(['pkg:@acme/web', 'pkg:@acme/web::file:src/a.ts']);
  return { ...base, meta: { ...base.meta, ...over } };
}

const api = { meta: vi.fn(), snapshot: vi.fn(), openDocs: vi.fn() };

async function render(lang: 'en' | 'fr' = 'en') {
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function byTestId(el: HTMLElement, id: string): HTMLElement | null {
  return el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

async function openSettings(
  fixture: { whenStable: () => Promise<unknown> },
  el: HTMLElement,
): Promise<void> {
  byTestId(el, 'menu-trigger-settings')?.click();
  await fixture.whenStable();
  expect(byTestId(el, 'menu-panel'), 'menu opens').not.toBeNull();
}

describe('MapPageComponent', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot
      .mockReset()
      .mockResolvedValue(snapshot(['pkg:@acme/web', 'pkg:@acme/web::file:src/a.ts']));
    api.openDocs.mockReset().mockResolvedValue(undefined);
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  });

  it('shows a loading state while the API has not answered', async () => {
    api.meta.mockReturnValue(new Promise(() => {}));
    const { el } = await render();
    expect(el.textContent).toMatch(/loading/i);
    expect(byTestId(el, 'error')).toBeNull();
  });

  it('shows the repo name and the ref in the top bar once loaded', async () => {
    const { el } = await render();
    expect(byTestId(el, 'repo-name')?.textContent?.trim()).toBe('acme-shop');
    expect(byTestId(el, 'ref')?.textContent).toContain('feat/promo-codes');
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toMatch(/loading/i);
  });

  it('shows the repo name, then the languages and detector from the snapshot meta', async () => {
    api.snapshot.mockResolvedValue(
      snapshotWith({ adapters: ['typescript'], detector: 'workspaces' }),
    );
    const { el } = await render();
    const name = byTestId(el, 'repo-name');
    expect(name?.querySelector('b')?.textContent?.trim()).toBe('acme-shop');
    expect(byTestId(el, 'repo-meta')?.textContent?.trim()).toBe('TypeScript · workspaces');
  });

  it('has the logo icon next to the relief word', async () => {
    const { el } = await render();
    const logo = el.querySelector('header.topbar .logo');
    expect(logo?.querySelector('svg')).not.toBeNull();
    expect(logo?.textContent?.trim()).toBe('relief');
  });

  it('puts the magnifier and the slash key inside the search field', async () => {
    const { el } = await render();
    const box = el.querySelector('.search-box');
    expect(box?.querySelector('[data-testid="search-icon"]')).not.toBeNull();
    expect(box?.querySelector('kbd')?.textContent?.trim()).toBe('/');
  });

  it('shows the range split into source and destination in the range control', async () => {
    const { el } = await render();
    expect(byTestId(el, 'compare-destination')?.textContent?.trim()).toBe('main');
    expect(byTestId(el, 'compare-source')?.textContent?.trim()).toBe('feat/promo-codes');
  });

  it('shows the working tree as the head when the repo is opened without a range', async () => {
    api.meta.mockResolvedValue({ ...META, range: null });
    const { el } = await render();
    expect(byTestId(el, 'compare-destination')?.textContent?.trim()).toBe('HEAD');
    expect(byTestId(el, 'compare-source')?.textContent?.trim()).toBe('Working tree');
  });

  it('labels the working tree in French', async () => {
    api.meta.mockResolvedValue({ ...META, range: null });
    const { el } = await render('fr');
    expect(byTestId(el, 'compare-source')?.textContent?.trim()).toBe('Arbre de travail');
  });

  it('the top bar has the menu bar and no settings button, the range picker stays', async () => {
    const { el } = await render();
    expect(byTestId(el, 'menu-trigger-workspace')).not.toBeNull();
    expect(byTestId(el, 'settings-button')).toBeNull();
    expect(byTestId(el, 'reload-button')).toBeNull();
    expect(byTestId(el, 'compare-destination')).not.toBeNull();
  });

  it('shows the API message when the API answers 500, not a blank page', async () => {
    api.meta.mockRejectedValue(new Error('index failed: cannot read objects'));
    const { el } = await render();
    expect(byTestId(el, 'error')?.textContent).toContain('index failed: cannot read objects');
    expect(el.textContent?.trim()).not.toBe('');
  });

  it('shows the API message when the snapshot fails after the meta succeeded', async () => {
    api.snapshot.mockRejectedValue(new Error("cannot resolve 'feat/promo-codes'"));
    const { el } = await render();
    expect(byTestId(el, 'error')?.textContent).toContain("cannot resolve 'feat/promo-codes'");
  });

  it('shows an empty-repository state when the snapshot has no node', async () => {
    api.snapshot.mockResolvedValue(snapshot([]));
    const { el } = await render();
    expect(byTestId(el, 'empty')?.textContent).toMatch(/empty/i);
    expect(byTestId(el, 'error')).toBeNull();
    expect(byTestId(el, 'repo-name')?.textContent?.trim()).toBe('acme-shop');
  });

  it('shows no empty or error state for a repository with nodes', async () => {
    const { el } = await render();
    expect(byTestId(el, 'empty')).toBeNull();
    expect(byTestId(el, 'error')).toBeNull();
  });

  it('has an active search field', async () => {
    const { el } = await render();
    const search = byTestId(el, 'search');
    expect(search).not.toBeNull();
    const input = search instanceof HTMLInputElement ? search : search?.querySelector('input');
    expect(input?.disabled).toBe(false);
  });

  describe('search results', () => {
    const SESSION = 'pkg:@acme/api::file:auth/session.ts';

    async function search(lang: 'en' | 'fr', query: string) {
      api.snapshot.mockResolvedValue({
        ...snapshot(['pkg:@acme/api']),
        graph: {
          commit: '0123456789abcdef0123456789abcdef01234567',
          edges: [],
          nodes: [
            { id: 'pkg:@acme/api', kind: 'package', parent: null },
            { id: SESSION, kind: 'file', parent: 'pkg:@acme/api' },
            { id: `${SESSION}::sym:SessionStore.refresh`, kind: 'symbol', parent: SESSION },
          ].map((n) => ({
            ...n,
            kind: n.kind as 'package' | 'file' | 'symbol',
            subkind: 'x',
            visibility: 'public' as const,
            contentHash: 'h',
          })),
        },
      });
      const { fixture, el } = await render(lang);
      const input = byTestId(el, 'search') as HTMLInputElement;
      input.focus();
      input.value = query;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      const rows = Array.from(el.querySelectorAll('[data-testid="search-result"]'));
      return rows.map((row) => row.textContent ?? '');
    }

    it('names the type of a symbol result in French', async () => {
      const symbol = (await search('fr', 'refresh'))[0];
      expect(symbol).toContain('SessionStore.refresh');
      expect(symbol).toContain('symbole');
      expect(symbol).not.toMatch(/^symbol(?!e)/);
    });

    it('names the type of a file result in French', async () => {
      const file = (await search('fr', 'session.ts'))[0];
      expect(file).toContain('session.ts');
      expect(file).toContain('fichier');
      expect(file).not.toMatch(/^file/);
    });

    it('names the type of each result in English', async () => {
      expect((await search('en', 'refresh'))[0]).toMatch(/^symbol/);
    });
  });

  it('switches language from the menu without reloading', async () => {
    const { fixture, el } = await render();
    await openSettings(fixture, el);
    byTestId(el, 'menu-item-language-fr')?.click();
    await fixture.whenStable();
    expect(byTestId(el, 'menu-trigger-settings')?.textContent?.trim()).toBe('Paramètres');
    expect(byTestId(el, 'repo-name')?.textContent?.trim()).toBe('acme-shop');
    expect(api.meta).toHaveBeenCalledTimes(1);
  });

  it('switches the theme from the menu: Dark, Light, then System', async () => {
    const { fixture, el } = await render();
    for (const [id, dark] of [
      ['dark', true],
      ['light', false],
    ] as const) {
      await openSettings(fixture, el);
      byTestId(el, `menu-item-theme-${id}`)?.click();
      await fixture.whenStable();
      expect(document.documentElement.classList.contains('dark')).toBe(dark);
    }
    await openSettings(fixture, el);
    byTestId(el, 'menu-item-theme-system')?.click();
    await fixture.whenStable();
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('Shortcuts opens the help and closes the menu', async () => {
    const { fixture, el } = await render();
    await openSettings(fixture, el);
    byTestId(el, 'menu-item-shortcuts')?.click();
    await fixture.whenStable();
    expect(byTestId(el, 'shortcuts-help')).not.toBeNull();
    expect(byTestId(el, 'menu-panel')).toBeNull();
  });

  it('Documentation opens the docs in the UI language (English) and closes the menu', async () => {
    const { fixture, el } = await render('en');
    byTestId(el, 'menu-trigger-help')?.click();
    await fixture.whenStable();
    byTestId(el, 'menu-item-docs')?.click();
    await fixture.whenStable();
    expect(api.openDocs).toHaveBeenCalledExactlyOnceWith('en');
    expect(byTestId(el, 'menu-panel')).toBeNull();
  });

  it('Documentation opens the docs in the UI language (French)', async () => {
    const { fixture, el } = await render('fr');
    byTestId(el, 'menu-trigger-help')?.click();
    await fixture.whenStable();
    byTestId(el, 'menu-item-docs')?.click();
    expect(api.openDocs).toHaveBeenCalledExactlyOnceWith('fr');
  });
});
