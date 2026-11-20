import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeBusiness } from './theme.business';

/** A controllable `prefers-color-scheme: dark` media query. */
function stubMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('dark') && dark;
    },
    media: query,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.delete(l),
  }));
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((l) => l({ matches: next }));
    },
  };
}

const isDarkClass = () => document.documentElement.classList.contains('dark');

describe('ThemeBusiness', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts in system mode, following a dark system, when nothing is saved', () => {
    stubMedia(true);
    const theme = TestBed.inject(ThemeBusiness);
    expect(theme.mode()).toBe('system');
    expect(theme.dark()).toBe(true);
    expect(isDarkClass()).toBe(true);
  });

  it('starts in system mode, light, on a light system', () => {
    stubMedia(false);
    const theme = TestBed.inject(ThemeBusiness);
    expect(theme.mode()).toBe('system');
    expect(theme.dark()).toBe(false);
    expect(isDarkClass()).toBe(false);
  });

  it('Dark forces the dark class and saves the choice', () => {
    stubMedia(false);
    const theme = TestBed.inject(ThemeBusiness);
    theme.setMode('dark');
    expect(theme.mode()).toBe('dark');
    expect(theme.dark()).toBe(true);
    expect(isDarkClass()).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('Light stays light on a dark system and saves the choice', () => {
    stubMedia(true);
    const theme = TestBed.inject(ThemeBusiness);
    theme.setMode('light');
    expect(theme.mode()).toBe('light');
    expect(theme.dark()).toBe(false);
    expect(isDarkClass()).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('System follows the media query and clears the saved preference', () => {
    const media = stubMedia(false);
    const theme = TestBed.inject(ThemeBusiness);
    theme.setMode('dark');
    theme.setMode('system');
    expect(theme.mode()).toBe('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(theme.dark()).toBe(false);
    media.set(true);
    expect(theme.dark()).toBe(true);
    expect(isDarkClass()).toBe(true);
    media.set(false);
    expect(isDarkClass()).toBe(false);
  });

  it('system mode never writes to localStorage', () => {
    const media = stubMedia(false);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const theme = TestBed.inject(ThemeBusiness);
    media.set(true);
    expect(theme.mode()).toBe('system');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('restores a saved dark choice over a light system', () => {
    localStorage.setItem('theme', 'dark');
    stubMedia(false);
    const theme = TestBed.inject(ThemeBusiness);
    expect(theme.mode()).toBe('dark');
    expect(isDarkClass()).toBe(true);
  });

  it('a media change does not override an explicit choice', () => {
    const media = stubMedia(false);
    const theme = TestBed.inject(ThemeBusiness);
    theme.setMode('light');
    media.set(true);
    expect(theme.dark()).toBe(false);
    expect(isDarkClass()).toBe(false);
  });
});
