import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MenuBarComponent } from './menu-bar.component';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

interface Emitted {
  theme: string[];
  language: string[];
  shortcuts: number;
  reload: number;
  docs: number;
  openRepo: number;
}

describe('MenuBarComponent', () => {
  let fixture: ComponentFixture<MenuBarComponent>;
  let host: HTMLElement;
  let emitted: Emitted;

  const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const must = (id: string) => {
    const el = q(id);
    if (!el) throw new Error(`no element ${id}`);
    return el;
  };
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const click = async (id: string) => {
    must(id).click();
    await settle();
  };
  const key = async (target: Element | Window, init: KeyboardEventInit) => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
    await settle();
  };
  const focusedId = () => document.activeElement?.getAttribute('data-testid');

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [MenuBarComponent], providers: TEST_PROVIDERS });
    await TestBed.inject(TranslateService).use('en').toPromise();
    fixture = TestBed.createComponent(MenuBarComponent);
    fixture.componentRef.setInput('theme', 'system');
    fixture.componentRef.setInput('language', 'en');
    fixture.componentRef.setInput('languages', LANGUAGES);
    fixture.componentRef.setInput('canReload', true);
    emitted = { theme: [], language: [], shortcuts: 0, reload: 0, docs: 0, openRepo: 0 };
    const c = fixture.componentInstance;
    c.themeChange.subscribe((v: string) => emitted.theme.push(v));
    c.languageChange.subscribe((v: string) => emitted.language.push(v));
    c.shortcuts.subscribe(() => emitted.shortcuts++);
    c.reload.subscribe(() => emitted.reload++);
    c.docs.subscribe(() => emitted.docs++);
    c.openRepo.subscribe(() => emitted.openRepo++);
    host = fixture.nativeElement;
    await settle();
  });

  it('shows the three menus, closed, in order', () => {
    const bar = host.querySelector('[role="menubar"]');
    expect(bar).not.toBeNull();
    const names = [
      ...host.querySelectorAll(
        '[role="menubar"] > [role="menuitem"], [role="menubar"] [data-testid^="menu-trigger-"]',
      ),
    ].map((el) => el.textContent?.trim());
    expect(names).toEqual(['Workspace', 'Settings', 'Help']);
    expect(q('menu-panel')).toBeNull();
  });

  it('the Workspace menu lists the four entries', async () => {
    await click('menu-trigger-workspace');
    expect(must('menu-trigger-workspace').getAttribute('aria-expanded')).toBe('true');
    const labels = [...host.querySelectorAll('[data-testid="menu-panel"] [role="menuitem"]')].map(
      (el) => el.textContent?.trim(),
    );
    expect(labels).toEqual([
      'Open a repository…',
      'Open a workspace…',
      'Add a repository to the workspace…',
      'Open this repository as a workspace',
    ]);
  });

  it('the multi-repo entries are disabled with a tooltip, Open a repository is not', async () => {
    await click('menu-trigger-workspace');
    expect(must('menu-item-open-repo').getAttribute('aria-disabled')).not.toBe('true');
    for (const id of ['open-workspace', 'add-repo', 'open-as-workspace']) {
      const item = must(`menu-item-${id}`);
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect((item.getAttribute('title') ?? '').length).toBeGreaterThan(0);
    }
  });

  it('clicking a disabled entry emits nothing and keeps the menu open', async () => {
    await click('menu-trigger-workspace');
    await click('menu-item-add-repo');
    expect(emitted.openRepo).toBe(0);
    expect(q('menu-panel')).not.toBeNull();
  });

  it('Open a repository emits openRepo and closes the menu', async () => {
    await click('menu-trigger-workspace');
    await click('menu-item-open-repo');
    expect(emitted.openRepo).toBe(1);
    expect(q('menu-panel')).toBeNull();
  });

  it('the Settings menu lists theme, language, shortcuts and reload', async () => {
    await click('menu-trigger-settings');
    for (const id of [
      'theme-light',
      'theme-dark',
      'theme-system',
      'language-en',
      'language-fr',
      'shortcuts',
      'reload',
    ]) {
      expect(q(`menu-item-${id}`), id).not.toBeNull();
    }
    expect(q('menu-item-docs')).toBeNull();
  });

  it('marks the current theme and language as checked', async () => {
    fixture.componentRef.setInput('theme', 'dark');
    await settle();
    await click('menu-trigger-settings');
    expect(must('menu-item-theme-dark').getAttribute('aria-checked')).toBe('true');
    expect(must('menu-item-theme-light').getAttribute('aria-checked')).toBe('false');
    expect(must('menu-item-language-en').getAttribute('aria-checked')).toBe('true');
    expect(must('menu-item-language-fr').getAttribute('aria-checked')).toBe('false');
  });

  it('picking a theme emits it', async () => {
    await click('menu-trigger-settings');
    await click('menu-item-theme-dark');
    expect(emitted.theme).toEqual(['dark']);
  });

  it('picking a language emits its code', async () => {
    await click('menu-trigger-settings');
    await click('menu-item-language-fr');
    expect(emitted.language).toEqual(['fr']);
  });

  it('Shortcuts emits shortcuts and closes the menu', async () => {
    await click('menu-trigger-settings');
    await click('menu-item-shortcuts');
    expect(emitted.shortcuts).toBe(1);
    expect(q('menu-panel')).toBeNull();
  });

  it('Reload emits reload and closes the menu', async () => {
    await click('menu-trigger-settings');
    await click('menu-item-reload');
    expect(emitted.reload).toBe(1);
    expect(q('menu-panel')).toBeNull();
  });

  it('Reload is disabled when there is nothing to reload', async () => {
    fixture.componentRef.setInput('canReload', false);
    await settle();
    await click('menu-trigger-settings');
    expect(must('menu-item-reload').getAttribute('aria-disabled')).toBe('true');
    await click('menu-item-reload');
    expect(emitted.reload).toBe(0);
  });

  it('the Help menu has Documentation, which emits docs', async () => {
    await click('menu-trigger-help');
    await click('menu-item-docs');
    expect(emitted.docs).toBe(1);
    expect(q('menu-panel')).toBeNull();
  });

  it('opening another menu closes the first', async () => {
    await click('menu-trigger-settings');
    await click('menu-trigger-help');
    expect(q('menu-item-docs')).not.toBeNull();
    expect(q('menu-item-reload')).toBeNull();
  });

  it('a click outside closes the menu', async () => {
    await click('menu-trigger-settings');
    document.body.click();
    await settle();
    expect(q('menu-panel')).toBeNull();
  });

  it('Alt + the access letter opens the menu and focuses its first entry', async () => {
    await key(window, { key: 'w', altKey: true });
    expect(q('menu-item-open-repo')).not.toBeNull();
    expect(focusedId()).toBe('menu-item-open-repo');
    await key(window, { key: 'Escape' });
    await key(window, { key: 's', altKey: true });
    expect(q('menu-item-reload')).not.toBeNull();
    await key(window, { key: 'Escape' });
    await key(window, { key: 'h', altKey: true });
    expect(q('menu-item-docs')).not.toBeNull();
  });

  it('Escape closes the menu and puts the focus back on its trigger', async () => {
    await key(window, { key: 's', altKey: true });
    await key(document.activeElement ?? window, { key: 'Escape' });
    expect(q('menu-panel')).toBeNull();
    expect(focusedId()).toBe('menu-trigger-settings');
  });

  it('ArrowDown and ArrowUp move through the entries, skipping disabled ones', async () => {
    await key(window, { key: 'w', altKey: true });
    expect(focusedId()).toBe('menu-item-open-repo');
    await key(document.activeElement as Element, { key: 'ArrowDown' });
    // every other workspace entry is disabled for now: the focus wraps back
    expect(focusedId()).toBe('menu-item-open-repo');

    await key(document.activeElement as Element, { key: 'Escape' });
    await key(window, { key: 's', altKey: true });
    expect(focusedId()).toBe('menu-item-theme-light');
    await key(document.activeElement as Element, { key: 'ArrowDown' });
    expect(focusedId()).toBe('menu-item-theme-dark');
    await key(document.activeElement as Element, { key: 'ArrowUp' });
    expect(focusedId()).toBe('menu-item-theme-light');
    await key(document.activeElement as Element, { key: 'ArrowUp' });
    expect(focusedId()).toBe('menu-item-reload');
  });

  it('ArrowRight and ArrowLeft switch to the neighbouring menu', async () => {
    await key(window, { key: 's', altKey: true });
    await key(document.activeElement as Element, { key: 'ArrowRight' });
    expect(q('menu-item-docs')).not.toBeNull();
    expect(q('menu-item-reload')).toBeNull();
    await key(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(q('menu-item-reload')).not.toBeNull();
    await key(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(q('menu-item-open-repo')).not.toBeNull();
  });

  it('ArrowDown on a focused trigger opens its menu', async () => {
    must('menu-trigger-help').focus();
    await key(must('menu-trigger-help'), { key: 'ArrowDown' });
    expect(q('menu-item-docs')).not.toBeNull();
    expect(focusedId()).toBe('menu-item-docs');
  });

  it('uses the French labels and access letters when the language is French', async () => {
    await TestBed.inject(TranslateService).use('fr').toPromise();
    fixture.componentRef.setInput('language', 'fr');
    await settle();
    expect(must('menu-trigger-workspace').textContent?.trim()).toBe('Espace de travail');
    expect(must('menu-trigger-settings').textContent?.trim()).toBe('Paramètres');
    expect(must('menu-trigger-help').textContent?.trim()).toBe('Aide');
    await key(window, { key: 'p', altKey: true });
    expect(q('menu-item-reload')).not.toBeNull();
  });
});
