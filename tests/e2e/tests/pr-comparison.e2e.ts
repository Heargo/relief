// @fixture acme-shop
// @no-range
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (ticket K05), on acme-shop opened WITHOUT a range (`// @no-range` on the
// second line makes wdio.base.ts start the app on the repository alone):
//  - `compare-section` reads source -> merged into -> destination: `compare-source` (button),
//    `compare-merged-into` ("merged into"), `compare-destination` (button);
//  - without configuration the source is "Working tree" and the destination `main`;
//  - each button opens the `range-popover` (`range-option` rows, tab `range-tab-branches`); picking
//    a row sets the range `destination...source` (URL `?range=`);
//  - `compare-default` ("Set as default") writes `.relief/settings.json`; the app reads it back
//    when it is opened again without a range.
const PROMO = 'feat/promo-codes';
const settingsFile = () =>
  join(process.env['RELIEF_E2E_REPO'] as string, '.relief', 'settings.json');
const clearSettings = () => rmSync(settingsFile(), { force: true });

const pick = async (button: string, ref: string) => {
  await tid(button).click();
  await tid('range-popover').waitForDisplayed();
  await tid('range-tab-branches').click();
  await $(`//*[@data-testid="range-option"][normalize-space(.)="${ref}"]`).click();
  await tid('range-popover').waitForExist({ reverse: true });
};

before(clearSettings);
after(clearSettings);

it('shows the working tree merged into main without any configuration', async () => {
  clearSettings();
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('compare-source')).toHaveText('Working tree');
  await expect(tid('compare-merged-into')).toHaveText(expect.stringContaining('merged into'));
  await expect(tid('compare-destination')).toHaveText('main');
});

it('changing the source changes the map: main merged into main is empty', async () => {
  clearSettings();
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('pr-stats').waitForExist();
  await pick('compare-source', PROMO);
  await expect(tid('compare-source')).toHaveText(PROMO);
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '15');
  expect(new URL(await browser.getUrl()).searchParams.get('range')).toBe(`main...${PROMO}`);

  await pick('compare-source', 'main');
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '0');
});

it('"Set as default" survives a reload of the app', async () => {
  clearSettings();
  await openRelief({ size: { width: 1280, height: 800 } });
  await pick('compare-source', PROMO);
  await tid('compare-default').click();

  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('compare-source')).toHaveText(PROMO);
  await expect(tid('compare-destination')).toHaveText('main');
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '15');
});
