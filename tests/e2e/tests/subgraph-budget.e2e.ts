// @fixture wide
import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { poll, press, rect, settledAt, tid, tids, typeText } from '../helpers/ui';

// Contract with the UI, on `wide` (10 packages x 300 files, 6 012 nodes, more than the 2 000 the
// map shows): the core sends a subgraph, and
//  - exploration mode (`explore-toggle`) starts on the repo, `packages` and the ten `pkg-NN`
//    modules, each `pkg-NN` closed: its files are not in the DOM;
//  - double-clicking a closed package zooms into it and loads its content: the box carries
//    `data-testid="node-loading"` while the request runs, then the 300 files of the package are
//    on the map (`map-node` with `data-node-id` of the form `...::file:packages/pkg-03/file-NNN.ts`,
//    and the map never shows more than 2 000 nodes);
//  - the search field (`search`) asks the core: a symbol of a package that is not loaded
//    (`f7x42`) is found in `search-result`, and Enter selects it (`selected-node` carries its
//    `data-node-id`), loads its package and frames it (its `map-node` is displayed).
const PKG = 'pkg:wide/packages/pkg-03';
const SYMBOL = 'pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts::sym:f7x42';

const mapNodes = () =>
  browser.execute(() => document.querySelectorAll('[data-testid="map-node"]').length);

async function openExplore(size?: { width: number; height: number }) {
  await openRelief({ size });
  await tid('explore-toggle').click();
  await $(`[data-testid="map-node"][data-node-id="${PKG}"]`).waitForDisplayed({ timeout: 90000 });
}

it('zooming into a package loads its files', async () => {
  // A container opens only once its title is readable (U10): pkg-03 then measures ~2 800 px, so a
  // large window keeps its 300 files on screen (off-screen nodes are not drawn).
  await openExplore({ width: 3600, height: 2000 });
  await expect($(`[data-testid="map-node"][data-node-id^="${PKG}::file:"]`)).not.toExist();
  const pkg = `[data-testid="map-node"][data-node-id="${PKG}"]`;
  await settledAt(pkg);
  // At the first level the packages are too small to be interactive: zoom with the wheel on pkg-03.
  const box = await rect(pkg);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await browser.action('wheel').scroll({ x, y, deltaX: 0, deltaY: -40, duration: 0 }).perform();

  await poll(
    () =>
      browser.execute(
        (prefix: string) =>
          document.querySelectorAll(`[data-testid="map-node"][data-node-id^="${prefix}"]`).length,
        `${PKG}::file:`,
      ),
    (files) => files === 300,
    15000,
  );
  expect(await mapNodes()).toBeLessThanOrEqual(2000);
  await expect(tid('node-loading')).not.toExist();
});

it('searching a symbol that is not loaded finds it and frames it', async () => {
  await openExplore();
  await press('/');
  await expect(tid('search')).toBeFocused();
  await typeText('f7x42');
  await expect(tid('search-results')).toBeDisplayed();
  await expect(tids('search-result')[0]).toHaveText(expect.stringContaining('f7x42'));
  await press('Enter');

  await expect(tid('selected-node')).toHaveAttribute('data-node-id', SYMBOL);
  const target = `[data-testid="map-node"][data-node-id="${SYMBOL}"]`;
  await $(target).waitForDisplayed({ timeout: 10000 });
  await settledAt(target);
  expect(await mapNodes()).toBeLessThanOrEqual(2000);
});
