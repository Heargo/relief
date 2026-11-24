// @fixture tiny
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

it('the range control is not empty on a repo opened without a range', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('compare-source')).toBeDisplayed();
  expect((await tid('compare-destination').getText()).trim()).toBe('main');
  expect((await tid('compare-source').getText()).trim()).toMatch(/working tree/i);
});

it('the open range popover has an opaque background and a border', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('compare-source').waitForDisplayed();
  await tid('compare-source').click();
  const panel = await tid('range-popover');
  await panel.waitForDisplayed();
  const style = await browser.execute(() => {
    const el = document.querySelector('[data-testid="range-popover"]') as Element;
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopWidth, borderStyle: s.borderTopStyle };
  });
  expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.bg).not.toBe('transparent');
  expect(style.borderStyle).not.toBe('none');
  expect(parseFloat(style.border)).toBeGreaterThan(0);
});
