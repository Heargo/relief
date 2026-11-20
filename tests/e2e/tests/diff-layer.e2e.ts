import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { count, tid } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency), on main...feat/promo-codes:
//  - while the diff layer is on, each `data-testid="map-node"` carries `data-diff-status`
//    (added | removed | modified | moved | unchanged) and `data-diff-badges`, a space-separated
//    list of breaking-api | api | internal-signature | format-only; without a diff neither
//    attribute is present;
//  - the former place of a moved node is `data-testid="old-location"` with the old `data-node-id`;
//  - each `data-testid="map-edge"` carries `data-status` (added | removed | moved | unchanged);
//  - `data-testid="diff-legend"` is the legend;
//  - `data-testid="pr-stats"` (top of the left panel) carries `data-files`, `data-lines-added`
//    (not asserted here), `data-symbols-added|removed|modified|moved` and `data-signatures`;
//  - `data-testid="review-toggle"` is the "Relire la PR" switch (`aria-pressed`),
//    `data-testid="toggle-diff-layer"` the diff layer switch (`aria-pressed`);
//  - `data-testid="range-base"` / `range-head` are the two range pickers of the top bar (each
//    opens a `range-popover` with Branches / Tags / Commits tabs); the URL keeps the range in
//    `?range=`.
const DISCOUNT = 'pkg:@acme/api/billing::file:apps/api/billing/discount.ts';
const LEGACY = 'pkg:@acme/api/billing::file:apps/api/billing/legacyCoupon.ts';
const NEW_FORMAT = 'pkg:@acme/shared/money::file:packages/shared/money/format.ts';
const OLD_FORMAT = 'pkg:@acme/web/utils::file:apps/web/utils/format.ts';
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';

function node(id: string) {
  return $(`[data-testid="map-node"][data-node-id="${id}"]`);
}

const ANY = /.+/;

// A large viewport so that every file of the level is on screen (off-screen nodes are not drawn).
async function openFilesLevel(): Promise<void> {
  await openRelief({ size: { width: 3200, height: 2000 } });
  await tid('level-2').click();
  await expect(tid('current-level')).toHaveAttribute('data-level', '2');
}

it('files of the PR are marked added, removed, moved and format-only', async () => {
  await openFilesLevel();

  await expect(node(DISCOUNT)).toHaveAttribute('data-diff-status', 'added');
  await expect(node(LEGACY)).toHaveAttribute('data-diff-status', 'removed');
  await expect(node(NEW_FORMAT)).toHaveAttribute('data-diff-status', 'moved');
  await expect(node(CLIENT)).toHaveAttribute('data-diff-badges', /format-only/);
  await expect(
    $$(`[data-testid="old-location"][data-node-id="${OLD_FORMAT}"]`),
  ).toBeElementsArrayOfSize(1);
  await expect(tid('diff-legend')).toBeDisplayed();
});

it('the edge apps/web -> packages/db is new', async () => {
  await openRelief();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  const edge = `[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"]`;
  await expect($$(edge)).toBeElementsArrayOfSize(1);
  await expect($(edge)).toHaveAttribute('data-status', 'added');
});

it('hiding the unchanged edges keeps only the changed ones', async () => {
  await openRelief();
  const edges = '[data-testid="map-edge"]';
  await expect($(edges)).toBeDisplayed();
  const before = await count(edges);

  await tid('toggle-unchanged-edges').click();
  await expect($(edges)).toBeDisplayed();
  const after = await count(edges);
  expect(after).toBeLessThanOrEqual(before);
  await expect($$('[data-testid="map-edge"][data-status="unchanged"]')).toBeElementsArrayOfSize(0);
  await expect(
    $$(`[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"]`),
  ).toBeElementsArrayOfSize(1);
});

it('the PR card shows 15 files and the symbol counts per status', async () => {
  await openRelief();
  const stats = tid('pr-stats');
  await expect(stats).toBeDisplayed();
  await expect(stats).toHaveAttribute('data-files', '15');
  await expect(stats).toHaveAttribute('data-symbols-added', '9');
  await expect(stats).toHaveAttribute('data-symbols-removed', '1');
  await expect(stats).toHaveAttribute('data-symbols-modified', '11');
  await expect(stats).toHaveAttribute('data-symbols-moved', '1');
  await expect(stats).toHaveAttribute('data-signatures', '3');
});

it('switching off "Relire la PR" shows the map without the diff', async () => {
  await openFilesLevel();
  await expect(node(DISCOUNT)).toHaveAttribute('data-diff-status', 'added');

  await tid('review-toggle').click();
  await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(node(DISCOUNT)).not.toHaveAttribute('data-diff-status', ANY);
  // no node that only exists in the base: neither the removed file nor the old place of format.ts
  await expect(node(LEGACY)).not.toExist();
  await expect($$('[data-testid="old-location"]')).toBeElementsArrayOfSize(0);

  await tid('review-toggle').click();
  await expect(node(DISCOUNT)).toHaveAttribute('data-diff-status', 'added');
});

it('the diff layer can be hidden', async () => {
  await openFilesLevel();
  await tid('toggle-diff-layer').click();
  await expect(tid('toggle-diff-layer')).toHaveAttribute('aria-checked', 'false');
  await expect(node(DISCOUNT)).not.toHaveAttribute('data-diff-status', ANY);
});

it('changing the range in the selector reloads the diff and updates the URL', async () => {
  await openFilesLevel();
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '15');

  // Reverse range (base = feat/promo-codes, head = main), picked in the popovers: the merge base
  // is main itself, so the PR is empty.
  await tid('range-base').click();
  await tid('range-popover').waitForDisplayed();
  await tid('range-tab-branches').click();
  await $('//*[@data-testid="range-option"][normalize-space(.)="feat/promo-codes"]').click();
  await tid('range-head').click();
  await tid('range-popover').waitForDisplayed();
  await tid('range-tab-branches').click();
  await $('//*[@data-testid="range-option"][normalize-space(.)="main"]').click();

  await expect(tid('pr-stats')).toHaveAttribute('data-files', '0');
  await expect(node(DISCOUNT)).toHaveAttribute('data-diff-status', 'unchanged');
  expect(new URL(await browser.getUrl()).searchParams.get('range')).toBe('feat/promo-codes...main');
});

it('opening a URL with ?range= loads that range', async () => {
  await openRelief({ query: '?range=feat/promo-codes...main' });
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '0');
});

const INVOICES = 'pkg:@acme/web/pages::file:apps/web/pages/Invoices.tsx';

it('only client.ts is format-only: the PR card counts 1 and Invoices.tsx (moved import) is not badged', async () => {
  await openFilesLevel();
  await expect(tid('pr-stats')).toHaveText(expect.stringContaining('1 format only'));
  await expect(node(CLIENT)).toHaveAttribute('data-diff-badges', /format-only/);
  // apps/web is the bottom row of the level: pan up so that its pages are on screen too.
  await browser
    .action('pointer')
    .move({ x: 400, y: 1200 })
    .down()
    .move({ x: 400, y: 800, duration: 200 })
    .up()
    .perform();
  await expect(node(INVOICES)).toBeDisplayed();
  await expect(node(INVOICES)).not.toHaveAttribute('data-diff-badges', /format-only/);
});

it('at 1024x768 every element of the top bar fits in the viewport', async () => {
  await openRelief({ size: { width: 1024, height: 768 } });
  await expect(tid('range-base')).toBeDisplayed();
  const overflowing = await browser.execute(() =>
    [...document.querySelectorAll('header.topbar > *')]
      .map((item) => ({ item, box: item.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.left < 0 || box.right > 1024))
      .map(({ item, box }) => `${item.tagName}.${item.className} right=${Math.round(box.right)}`),
  );
  expect(overflowing).toEqual([]);
});
