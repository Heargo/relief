import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { ThemeMode } from '../../../../core/business/theme.business';
import {
  MENU_IDS,
  type MenuId,
  menuForAccessKey,
  nextItemIndex,
  nextMenuIndex,
} from '../../helpers/menu-nav.logic';

const THEMES: readonly ThemeMode[] = ['light', 'dark', 'system'];

interface MenuEntry {
  id: string;
  label: string;
  /** A translation key, or a literal (a language name). */
  translate: boolean;
  checked?: boolean;
  disabled: boolean;
  tooltip?: string;
  hint?: string;
  heading?: string;
  action: () => void;
}

/** The menu bar of the top bar: Workspace, Settings and Help, with their keyboard navigation. */
@Component({
  selector: 'app-menu-bar',
  imports: [TranslatePipe],
  templateUrl: './menu-bar.component.html',
  styleUrl: './menu-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuBarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);

  readonly theme = input.required<ThemeMode>();
  readonly language = input.required<string>();
  readonly languages = input.required<readonly { code: string; label: string }[]>();
  readonly canReload = input(false);

  readonly themeChange = output<ThemeMode>();
  readonly languageChange = output<string>();
  readonly shortcuts = output<void>();
  readonly reload = output<void>();
  readonly docs = output<void>();
  readonly openRepo = output<void>();

  protected readonly menus = MENU_IDS;
  protected readonly openMenu = signal<MenuId | null>(null);

  /** The access letters, in the current language (`menu.access.*`). */
  private readonly accessKeys = computed(() => {
    this.language();
    const letter = (id: MenuId) => this.translate.instant(`menu.access.${id}`) as string;
    return {
      workspace: letter('workspace'),
      settings: letter('settings'),
      help: letter('help'),
    };
  });

  protected readonly entries = computed<MenuEntry[]>(() => {
    const soon = 'menu.multiRepoSoon';
    switch (this.openMenu()) {
      case 'workspace':
        return [
          this.entry('open-repo', 'menu.items.openRepo', () => this.openRepo.emit()),
          this.entry('open-workspace', 'menu.items.openWorkspace', () => undefined, {
            disabled: true,
            tooltip: soon,
          }),
          this.entry('add-repo', 'menu.items.addRepo', () => undefined, {
            disabled: true,
            tooltip: soon,
          }),
          this.entry('open-as-workspace', 'menu.items.openAsWorkspace', () => undefined, {
            disabled: true,
            tooltip: soon,
          }),
        ];
      case 'settings':
        return [
          ...THEMES.map((mode, i) =>
            this.entry(`theme-${mode}`, `map.theme.${mode}`, () => this.themeChange.emit(mode), {
              checked: this.theme() === mode,
              heading: i === 0 ? 'map.settings.theme' : undefined,
            }),
          ),
          ...this.languages().map((lang, i) => ({
            ...this.entry(
              `language-${lang.code}`,
              lang.label,
              () => this.languageChange.emit(lang.code),
              {
                checked: this.language() === lang.code,
                heading: i === 0 ? 'map.settings.language' : undefined,
              },
            ),
            translate: false,
          })),
          this.entry('shortcuts', 'map.shortcuts', () => this.shortcuts.emit(), { hint: '?' }),
          this.entry('reload', 'review.reload', () => this.reload.emit(), {
            disabled: !this.canReload(),
          }),
        ];
      case 'help':
        return [this.entry('docs', 'map.settings.docs', () => this.docs.emit())];
      default:
        return [];
    }
  });

  private entry(
    id: string,
    label: string,
    action: () => void,
    extra: Partial<MenuEntry> = {},
  ): MenuEntry {
    return { id, label, translate: true, disabled: false, action, ...extra };
  }

  protected toggle(menu: MenuId): void {
    this.openMenu.set(this.openMenu() === menu ? null : menu);
  }

  protected pick(entry: MenuEntry): void {
    if (entry.disabled) return;
    this.openMenu.set(null);
    entry.action();
  }

  private open(menu: MenuId, focusFirst: boolean): void {
    this.openMenu.set(menu);
    if (focusFirst)
      afterNextRender(() => this.focusItem('ArrowDown', -1), { injector: this.injector });
  }

  private items(): HTMLElement[] {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>(
        '[data-testid="menu-panel"] [role^="menuitem"]',
      ),
    ];
  }

  private focusItem(key: string, current: number): void {
    const disabled = this.entries().map((e) => e.disabled);
    this.items()[nextItemIndex(disabled, current, key)]?.focus();
  }

  private closeToTrigger(menu: MenuId): void {
    this.openMenu.set(null);
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-testid="menu-trigger-${menu}"]`)
      ?.focus();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (this.openMenu() && !(target && this.host.nativeElement.contains(target))) {
      this.openMenu.set(null);
    }
  }

  @HostListener('window:keydown', ['$event'])
  @HostListener('keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const current = this.openMenu();
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const menu = menuForAccessKey(event.key, this.accessKeys());
      if (menu) {
        event.preventDefault();
        this.open(menu, true);
      }
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    const trigger = target?.closest<HTMLElement>('[data-testid^="menu-trigger-"]') ?? null;
    if (!current) {
      if (trigger && event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        this.open(trigger.dataset['testid']?.replace('menu-trigger-', '') as MenuId, true);
      }
      return;
    }
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closeToTrigger(current);
        return;
      case 'ArrowRight':
      case 'ArrowLeft': {
        event.preventDefault();
        event.stopPropagation();
        const next = nextMenuIndex(MENU_IDS.length, MENU_IDS.indexOf(current), event.key);
        this.open(MENU_IDS[next], true);
        return;
      }
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        event.preventDefault();
        event.stopPropagation();
        this.focusItem(event.key, this.items().indexOf(document.activeElement as HTMLElement));
        return;
      }
    }
  }
}
