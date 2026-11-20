import { Injectable, signal } from '@angular/core';

const THEME_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export type ThemeMode = 'light' | 'dark' | 'system';

function savedTheme(): 'dark' | 'light' | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function media(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null;
}

/** Light, dark or system theme: the `dark` class on `<html>` drives the CSS variables. */
@Injectable({ providedIn: 'root' })
export class ThemeBusiness {
  private readonly query = media();
  private readonly _mode = signal<ThemeMode>(savedTheme() ?? 'system');
  private readonly _systemDark = signal(this.query?.matches ?? false);
  readonly mode = this._mode.asReadonly();

  constructor() {
    this.query?.addEventListener('change', (event) => {
      this._systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  dark(): boolean {
    const mode = this._mode();
    return mode === 'system' ? this._systemDark() : mode === 'dark';
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this.apply();
    try {
      if (mode === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Storage unavailable: the choice is just not kept.
    }
  }

  private apply(): void {
    document.documentElement.classList.toggle('dark', this.dark());
  }
}
