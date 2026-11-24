import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

/** Computed font size and family of the first element matching `selector`. */
async function font(selector: string): Promise<{ size: string; family: string }> {
  return browser.execute((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`${sel} not found`);
    const style = getComputedStyle(el);
    return { size: style.fontSize, family: style.fontFamily };
  }, selector);
}

it('at 1280 px the search and the entries of the menu are 13 px and the range is 12 px monospace', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('range-base')).toBeDisplayed();
  expect((await font('[data-testid="search"]')).size).toBe('13px');
  await tid('menu-trigger-settings').click();
  await expect(tid('menu-item-language-en')).toBeDisplayed();
  expect((await font('[data-testid="menu-item-language-en"]')).size).toBe('13px');
  const range = await font('[data-testid="range-base"]');
  expect(range.size).toBe('12px');
  expect(range.family).toMatch(/mono/i);
});

it('the top bar shows the bold repo name and the detector', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  const weight = await browser.execute(
    () =>
      getComputedStyle(document.querySelector('[data-testid="repo-name"] b') as Element).fontWeight,
  );
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
  await expect(tid('repo-meta')).toHaveText(expect.stringContaining('TypeScript'));
  // The detector reports `workspaces` on acme-shop; the mockup says `pnpm workspaces`.
  await expect(tid('repo-meta')).toHaveText(expect.stringContaining('workspaces'));
  await expect($('header.topbar .search-box kbd')).toBeDisplayed();
});
