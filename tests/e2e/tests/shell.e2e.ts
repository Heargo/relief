import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { drag, rectOf, tid, viewportSize } from '../helpers/ui';

async function width(testId: string): Promise<number> {
  return (await rectOf(testId)).width;
}

it('opens on acme-shop and shows the repo name and the ref', async () => {
  await openRelief();
  await expect(tid('repo-name')).toHaveText('acme-shop');
  await expect(tid('ref')).toHaveText(expect.stringContaining('feat/promo-codes'));
});

it('changes language without reloading the page', async () => {
  await openRelief();
  await browser.execute(() => ((window as unknown as { marker: number }).marker = 42));
  await expect(tid('settings-button')).toHaveAttribute('aria-label', 'Settings');

  await tid('settings-button').click();
  await tid('language-select').$('button=Français').click();

  await expect(tid('settings-button')).toHaveAttribute('aria-label', 'Paramètres');
  await expect(tid('repo-name')).toHaveText('acme-shop');
  expect(await browser.execute(() => (window as unknown as { marker?: number }).marker)).toBe(42);
});

it('keeps a resized right panel after a reload and resets it on double-click', async () => {
  await openRelief();
  const initial = await width('right-panel');
  expect(initial).toBeCloseTo(430, 0);

  await drag('[data-testid="resize-right"]', -120);
  const resized = await width('right-panel');
  expect(resized).toBeGreaterThan(initial + 80);

  await browser.refresh();
  await expect(tid('repo-name')).toBeDisplayed();
  expect(await width('right-panel')).toBeCloseTo(resized, 0);

  await tid('resize-right').doubleClick();
  expect(await width('right-panel')).toBeCloseTo(430, 0);
});

it('the expand button widens the right panel, then restores it', async () => {
  await openRelief();
  const viewport = await viewportSize();

  await tid('expand-right').click();
  expect(await width('right-panel')).toBeGreaterThanOrEqual(viewport.width * 0.45);

  await tid('expand-right').click();
  expect(await width('right-panel')).toBeCloseTo(430, 0);
});
