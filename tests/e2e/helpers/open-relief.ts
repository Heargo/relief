import { browser, expect, $ } from '@wdio/globals';

export const DEFAULT_SIZE = { width: 1280, height: 720 };

/**
 * Starts from a clean webview, like a fresh browser context: the `localStorage` of the app survives
 * between sessions, so it is emptied (and the language pinned) before the page is loaded again.
 * With `RELIEF_E2E_RENDERER=canvas` (or `dom`), `renderer=<engine>` is added to the query.
 * Waits until the top bar shows the repository name. `query` is appended to `/` (e.g. `?range=…`).
 */
export async function openRelief(
  options: { lang?: string; query?: string; size?: { width: number; height: number } } = {},
): Promise<void> {
  const { lang = 'en', query = '', size = DEFAULT_SIZE } = options;
  await setViewport(size.width, size.height);
  await browser.execute((language: string) => {
    localStorage.clear();
    localStorage.setItem('lang', language);
  }, lang);
  await browser.execute(
    (target: string) => {
      window.location.assign(target);
    },
    `/${withRenderer(query)}`,
  );
  await $('[data-testid="repo-name"]').waitForDisplayed();
}

/** `query` with `renderer=` from `RELIEF_E2E_RENDERER` merged in, whatever `query` already holds. */
export function withRenderer(query: string, renderer = process.env.RELIEF_E2E_RENDERER): string {
  if (!renderer) return query;
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  if (!params.has('renderer')) params.set('renderer', renderer);
  const text = params.toString();
  return text ? `?${text}` : '';
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
