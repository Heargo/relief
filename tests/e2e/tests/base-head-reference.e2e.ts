import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (ticket U23), on acme-shop main...feat/promo-codes:
//  - `range-role-base` ("Reference · base") and `range-role-head` ("Changes · head") label the two
//    selectors of the top bar;
//  - `range-mode` shows `···→` (merge base) or `→` (direct diff);
//  - `range-reading` is the reading line under the top bar: it names head, base and the short sha
//    of the base really compared.

async function openLoaded(): Promise<void> {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('pr-stats').waitForExist();
}

it('both selectors carry their role', async () => {
  await openLoaded();
  await expect(tid('range-role-base')).toHaveText(expect.stringContaining('Reference'));
  await expect(tid('range-role-base')).toHaveText(expect.stringContaining('base'));
  await expect(tid('range-role-head')).toHaveText(expect.stringContaining('Changes'));
  await expect(tid('range-role-head')).toHaveText(expect.stringContaining('head'));
  await expect(tid('range-mode')).toHaveText('···→');
});

it('the reading line names head, base and the sha of the merge base', async () => {
  await openLoaded();
  const line = tid('range-reading');
  await line.waitForDisplayed();
  await expect(line).toHaveText(expect.stringContaining('feat/promo-codes'));
  await expect(line).toHaveText(expect.stringContaining('main'));
  await expect(line).toHaveText(expect.stringMatching(/[0-9a-f]{7}/));
});

it('the reading line says "as is" for a direct diff', async () => {
  await openLoaded();
  await tid('range-mode').click();
  await expect(tid('range-mode')).toHaveText('→');
  await expect(tid('range-reading')).toHaveText(expect.stringContaining('main'));
  await expect(tid('range-reading')).not.toHaveText(expect.stringMatching(/[0-9a-f]{7}/));
});

it('swap exchanges the two refs', async () => {
  await openLoaded();
  await tid('range-swap').click();
  await expect(tid('range-base')).toHaveText('feat/promo-codes');
  await expect(tid('range-head')).toHaveText('main');
  await expect(tid('range-role-base')).toHaveText(expect.stringContaining('base'));
});

it('the reading line fades after a few seconds', async () => {
  await openLoaded();
  await tid('range-reading').waitForDisplayed();
  await tid('range-reading').waitForDisplayed({ reverse: true, timeout: 9000 });
});

it('swap is disabled on the working tree, with a tooltip saying why', async () => {
  await openLoaded();
  await tid('range-head').click();
  await tid('range-popover').waitForDisplayed();
  await $('//*[@data-testid="range-option"][contains(normalize-space(.), "Working tree")]').click();
  await expect(tid('range-swap')).toBeDisabled();
  expect(await tid('range-swap').getAttribute('title')).toMatch(/working tree/i);
  await expect(tid('range-reading')).toHaveText(expect.stringContaining('HEAD'));
  void browser;
});
