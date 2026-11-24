import { $, $$, browser } from '@wdio/globals';

/** The element carrying `data-testid="id"`. */
export const tid = (id: string) => $(`[data-testid="${id}"]`);
/** All the elements carrying `data-testid="id"`. */
export const tids = (id: string) => $$(`[data-testid="${id}"]`);

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box (viewport coordinates) of the first element matching a CSS selector. */
export async function rect(selector: string): Promise<Rect> {
  const box = await browser.execute((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  if (!box) throw new Error(`${selector} is not visible`);
  return box;
}

export const rectOf = (id: string) => rect(`[data-testid="${id}"]`);

/**
 * Waits until the element matching `selector` exists and stops moving (the camera animation of
 * the map is over), so that a click lands on it and not on whatever slides under the pointer.
 */
export async function settledAt(selector: string, timeout = 8000): Promise<void> {
  let previous = '';
  await browser.waitUntil(
    async () => {
      const box = await browser.execute((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      }, selector);
      const same = box !== null && box === previous;
      previous = box ?? '';
      return same;
    },
    { timeout, interval: 300, timeoutMsg: `${selector} never stopped moving` },
  );
}

/** Number of elements matching a CSS selector. */
export async function count(selector: string): Promise<number> {
  return browser.execute((sel: string) => document.querySelectorAll(sel).length, selector);
}

const SPACE = '';

/**
 * Types text into the focused element, one key press per character (a single `keys` call drops
 * repeated characters and spaces).
 */
export async function typeText(text: string): Promise<void> {
  for (const char of text) await browser.keys(char === ' ' ? SPACE : char);
}

export const press = (key: string) => browser.keys(key);

/** Polls until `read` satisfies `done`; fails after `timeout` ms. */
export async function poll<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeout = 5000,
): Promise<T> {
  let last: T | undefined;
  await browser.waitUntil(
    async () => {
      last = await read();
      return done(last);
    },
    { timeout, interval: 100, timeoutMsg: 'condition not met in time' },
  );
  return last as T;
}

/** A click that does not depend on hit-testing (SVG shapes, overlapped edges). */
export async function forceClick(selector: string): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
}

export async function drag(selector: string, dx: number): Promise<void> {
  const box = await rect(selector);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await browser
    .action('pointer')
    .move({ x, y })
    .down()
    .move({ x: x + dx, y, duration: 200 })
    .up()
    .perform();
}

export async function viewportSize(): Promise<{ width: number; height: number }> {
  return browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

/** Opens the Layers menu of the top bar, unless it is already open. */
export async function openLayersMenu(): Promise<void> {
  const trigger = tid('menu-trigger-layers');
  await trigger.waitForExist();
  await browser.waitUntil(async () => (await trigger.getAttribute('aria-disabled')) !== 'true', {
    timeoutMsg: 'the Layers menu stays disabled',
  });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await tid('layers-panel').waitForDisplayed();
}

/**
 * Flips the layer toggle `id` (`toggle-*`) from the Layers menu of the top bar: opens the menu,
 * clicks the toggle, then closes the menu (Escape) so it covers nothing of the map. The toggles
 * stay in the DOM while the menu is closed, so their `aria-checked` can be read at any time.
 */
export async function toggleLayer(id: string): Promise<void> {
  await openLayersMenu();
  await tid(id).click();
  await browser.keys('Escape');
  await tid('layers-panel').waitForDisplayed({ reverse: true });
}
