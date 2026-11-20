import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press } from '../helpers/ui';

it('opens the UI on acme-shop with the repo name in the title and a clean console', async () => {
  await openRelief();
  // WebDriver classic has no console events and the page is already loaded when the session
  // answers: the listeners are installed right after the load, then the map is exercised.
  await browser.execute(() => {
    const w = window as unknown as { errors: string[] };
    w.errors = [];
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      w.errors.push(args.map(String).join(' '));
      original(...args);
    };
    window.addEventListener('error', (event) => w.errors.push(event.message));
    window.addEventListener('unhandledrejection', (event) => w.errors.push(String(event.reason)));
  });
  await press('2');
  await press('0');
  await $('[data-testid="map-canvas"]').waitForDisplayed();

  await expect(browser).toHaveTitle(expect.stringContaining('acme-shop'));
  const errors = await browser.execute(() => (window as unknown as { errors: string[] }).errors);
  expect(errors).toEqual([]);
});
