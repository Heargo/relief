import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (ticket U23), on acme-shop main...feat/promo-codes:
//  - the two selectors are `compare-source` and `compare-destination` (no role labels, no mode
//    button: the range read is always `destination...source`);
//  - `range-reading` is the reading line under the top bar: it names head, base and the short sha
//    of the base really compared.

async function openLoaded(): Promise<void> {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('pr-stats').waitForExist();
}

it('the selectors read source, merged into, destination', async () => {
  await openLoaded();
  await expect(tid('compare-source')).toHaveText('feat/promo-codes');
  await expect(tid('compare-destination')).toHaveText('main');
  await expect(tid('range-role-base')).not.toExist();
  await expect(tid('range-mode')).not.toExist();
});

it('the reading line names head, base and the sha of the merge base', async () => {
  await openLoaded();
  const line = tid('range-reading');
  await line.waitForDisplayed();
  await expect(line).toHaveText(expect.stringContaining('feat/promo-codes'));
  await expect(line).toHaveText(expect.stringContaining('main'));
  await expect(line).toHaveText(expect.stringMatching(/[0-9a-f]{7}/));
});

it('swap exchanges the two refs', async () => {
  await openLoaded();
  await tid('range-swap').click();
  await expect(tid('compare-destination')).toHaveText('feat/promo-codes');
  await expect(tid('compare-source')).toHaveText('main');
});

it('the reading line fades after a few seconds', async () => {
  await openLoaded();
  await tid('range-reading').waitForDisplayed();
  await tid('range-reading').waitForDisplayed({ reverse: true, timeout: 9000 });
});

it('swap is disabled on the working tree, with a tooltip saying why', async () => {
  await openLoaded();
  await tid('compare-source').click();
  await tid('range-popover').waitForDisplayed();
  await $('//*[@data-testid="range-option"][contains(normalize-space(.), "Working tree")]').click();
  await expect(tid('range-swap')).toBeDisabled();
  expect(await tid('range-swap').getAttribute('title')).toMatch(/working tree/i);
  await expect(tid('range-reading')).toHaveText(expect.stringContaining('HEAD'));
  void browser;
});
