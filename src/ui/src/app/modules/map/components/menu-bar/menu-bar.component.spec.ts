import { Component } from '@angular/core';
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
  addRepo: number;
  openAsWorkspace: number;
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
    emitted = {
      theme: [],
      language: [],
      shortcuts: 0,
      reload: 0,
      docs: 0,
      openRepo: 0,
      addRepo: 0,
      openAsWorkspace: 0,
    };
    const c = fixture.componentInstance;
    c.themeChange.subscribe((v: string) => emitted.theme.push(v));
    c.languageChange.subscribe((v: string) => emitted.language.push(v));
    c.shortcuts.subscribe(() => emitted.shortcuts++);
    c.reload.subscribe(() => emitted.reload++);
    c.docs.subscribe(() => emitted.docs++);
    c.openRepo.subscribe(() => emitted.openRepo++);
    c.addRepo.subscribe(() => emitted.addRepo++);
    c.openAsWorkspace.subscribe(() => emitted.openAsWorkspace++);
    host = fixture.nativeElement;
    await settle();
  });

  it('shows the four menus, closed, in order', () => {
    const bar = host.querySelector('[role="menubar"]');
    expect(bar).not.toBeNull();
    const names = [
      ...host.querySelectorAll(
        '[role="menubar"] > [role="menuitem"], [role="menubar"] [data-testid^="menu-trigger-"]',
      ),
    ].map((el) => el.textContent?.trim());
    expect(names).toEqual(['Workspace', 'Layers', 'Settings', 'Help']);
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

  it('on a single repository, "Open this repository as a workspace" is enabled and "Add a repository" is not', async () => {
    await click('menu-trigger-workspace');
    expect(must('menu-item-open-repo').getAttribute('aria-disabled')).not.toBe('true');
    expect(must('menu-item-open-workspace').getAttribute('aria-disabled')).not.toBe('true');
    expect(must('menu-item-open-as-workspace').getAttribute('aria-disabled')).not.toBe('true');
    expect(must('menu-item-add-repo').getAttribute('aria-disabled')).toBe('true');
  });

  it('in a workspace, "Add a repository to the workspace" is enabled and "Open as a workspace" is not', async () => {
    fixture.componentRef.setInput('workspace', true);
    await settle();
    await click('menu-trigger-workspace');
    expect(must('menu-item-add-repo').getAttribute('aria-disabled')).not.toBe('true');
    expect(must('menu-item-open-as-workspace').getAttribute('aria-disabled')).toBe('true');
  });

  it('clicking a disabled entry emits nothing and keeps the menu open', async () => {
    await click('menu-trigger-workspace');
    await click('menu-item-add-repo');
    expect(emitted.addRepo).toBe(0);
    expect(q('menu-panel')).not.toBeNull();
  });

  it('Open this repository as a workspace emits openAsWorkspace and closes the menu', async () => {
    await click('menu-trigger-workspace');
    await click('menu-item-open-as-workspace');
    expect(emitted.openAsWorkspace).toBe(1);
    expect(q('menu-panel')).toBeNull();
  });

  it('Add a repository to the workspace emits addRepo and closes the menu', async () => {
    fixture.componentRef.setInput('workspace', true);
    await settle();
    await click('menu-trigger-workspace');
    await click('menu-item-add-repo');
    expect(emitted.addRepo).toBe(1);
    expect(q('menu-panel')).toBeNull();
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
    expect(focusedId()).toBe('menu-item-open-workspace');
    // "Add a repository" is disabled on a single repository: the focus skips it
    await key(document.activeElement as Element, { key: 'ArrowDown' });
    expect(focusedId()).toBe('menu-item-open-as-workspace');
    await key(document.activeElement as Element, { key: 'ArrowDown' });
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
    expect(must('menu-trigger-layers').textContent?.trim()).toBe('Calques');
    await key(window, { key: 'p', altKey: true });
    expect(q('menu-item-reload')).not.toBeNull();
  });

  it('the Layers menu is disabled until the map is ready: it does not open', async () => {
    expect(must('menu-trigger-layers').getAttribute('aria-disabled')).toBe('true');
    await click('menu-trigger-layers');
    expect(q('layers-panel')?.hidden).toBe(true);
    await key(window, { key: 'l', altKey: true });
    expect(q('layers-panel')?.hidden).toBe(true);
  });
});

@Component({
  imports: [MenuBarComponent],
  template: `
    <app-menu-bar theme="system" language="en" [languages]="languages" [layers]="true">
      <div menuLayers data-testid="projected-layers">
        <button type="button" role="menuitemcheckbox" data-testid="layer-a">A</button>
        <button type="button" role="menuitemcheckbox" data-testid="layer-b">B</button>
      </div>
    </app-menu-bar>
  `,
})
class LayersHostComponent {
  readonly languages = LANGUAGES;
}

describe('MenuBarComponent, Layers menu', () => {
  let fixture: ComponentFixture<LayersHostComponent>;
  let host: HTMLElement;
  const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const key = async (target: Element | Window, init: KeyboardEventInit) => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
    await settle();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [LayersHostComponent], providers: TEST_PROVIDERS });
    await TestBed.inject(TranslateService).use('en').toPromise();
    fixture = TestBed.createComponent(LayersHostComponent);
    host = fixture.nativeElement;
    await settle();
  });

  it('shows the projected layer toggles only while the menu is open, kept in the DOM', async () => {
    const panel = () => q('layers-panel')!;
    expect(panel().contains(q('projected-layers'))).toBe(true);
    expect(panel().hidden).toBe(true);
    q('menu-trigger-layers')!.click();
    await settle();
    expect(panel().hidden).toBe(false);
    q('menu-trigger-layers')!.click();
    await settle();
    expect(panel().hidden).toBe(true);
  });

  it('closes on Escape, back to its trigger', async () => {
    await key(window, { key: 'l', altKey: true });
    await key(document.activeElement as Element, { key: 'Escape' });
    expect(q('layers-panel')!.hidden).toBe(true);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('menu-trigger-layers');
  });

  it('keeps the menu open when a layer is toggled', async () => {
    q('menu-trigger-layers')!.click();
    await settle();
    q('layer-a')!.click();
    await settle();
    expect(q('layers-panel')!.hidden).toBe(false);
  });

  it('Alt + L opens it on its first toggle, the arrows move between toggles', async () => {
    await key(window, { key: 'l', altKey: true });
    expect(document.activeElement?.getAttribute('data-testid')).toBe('layer-a');
    await key(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-testid')).toBe('layer-b');
  });

  it('sits between Workspace and Settings for ArrowLeft / ArrowRight', async () => {
    await key(window, { key: 'w', altKey: true });
    await key(document.activeElement as Element, { key: 'ArrowRight' });
    expect(q('layers-panel')!.hidden).toBe(false);
    expect(q('menu-item-open-repo')).toBeNull();
    await key(document.activeElement as Element, { key: 'ArrowRight' });
    expect(q('layers-panel')!.hidden).toBe(true);
    expect(q('menu-item-reload')).not.toBeNull();
  });
});
