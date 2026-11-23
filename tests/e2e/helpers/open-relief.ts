import { browser, expect, $ } from '@wdio/globals';

export const DEFAULT_SIZE = { width: 1280, height: 720 };

/**
 * Starts from a clean webview, like a fresh browser context: the `localStorage` of the app survives
 * between sessions, so it is emptied (and the language pinned) before the page is loaded again.
 * Waits until the top bar shows the repository name. `query` is appended to `/` (e.g. `?range=…`).
 */
export async function openRelief(
  options: {
    lang?: string;
    query?: string;
    size?: { width: number; height: number };
    /** Turns the "unchanged edges" layer on in review mode, where it is off by default (R16). */
    unchangedEdges?: boolean;
  } = {},
): Promise<void> {
  const { lang = 'en', query = '', size = DEFAULT_SIZE, unchangedEdges = false } = options;
  await setViewport(size.width, size.height);
  await browser.execute(
    (language: string, unchanged: boolean) => {
      localStorage.clear();
      localStorage.setItem('lang', language);
      if (unchanged) localStorage.setItem('relief.unchangedEdges.review', 'true');
    },
    lang,
    unchangedEdges,
  );
  await browser.execute((target: string) => {
    window.location.assign(target);
  }, `/${query}`);
  await $('[data-testid="repo-name"]').waitForDisplayed();
}

/** Sizes the page area (the viewport), not the window, to `width` x `height` CSS pixels. */
export async function setViewport(width: number, height: number): Promise<void> {
  await browser.setWindowSize(width, height);
  const inner = await browser.execute(() => ({ w: window.innerWidth, h: window.innerHeight }));
  if (inner.w !== width || inner.h !== height) {
    // The window has chrome around the page: grow it by the difference.
    const win = await browser.getWindowSize();
    await browser.setWindowSize(win.width + (width - inner.w), win.height + (height - inner.h));
  }
}

export { expect };
