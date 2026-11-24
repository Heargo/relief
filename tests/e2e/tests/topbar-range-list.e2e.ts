import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

it('on acme-shop the open range popover has an opaque background and a border', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('compare-source').waitForDisplayed();
  await tid('compare-source').click();
  await tid('range-popover').waitForDisplayed();
  const style = await browser.execute(() => {
    const el = document.querySelector('[data-testid="range-popover"]') as Element;
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, width: s.borderTopWidth, style: s.borderTopStyle };
  });
  expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.bg).not.toBe('transparent');
  expect(style.style).not.toBe('none');
  expect(parseFloat(style.width)).toBeGreaterThan(0);
});
