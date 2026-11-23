import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (ticket U19), on acme-shop main...feat/promo-codes:
//  - the range control of the top bar is `range-base` (button, text = base ref), a `range-mode`
//    button (`...` from the merge base, `..` direct diff, with `aria-label`/title saying which),
//    `range-head` (button, text = head ref, "Working tree" for WORKTREE), `range-swap` (⇄,
//    disabled when head is the working tree) and `range-count` ("5 commits"/"1 commit");
//  - `range-base` / `range-head` open `range-popover`: a `range-filter` field, tabs
//    `range-tab-branches`, `range-tab-tags`, `range-tab-commits`; branches and tags are
//    `range-option` rows, commits are `range-commit` rows (subject in the text, the commits of
//    the range carry `data-mark="in"`, the other end `data-mark="base"` or `"head"`);
//  - picking a row closes the popover and sets the range (URL `?range=`).
const PROMO = 'feat/promo-codes';
const MAIN = 'main';

const rangeParam = async () => new URL(await browser.getUrl()).searchParams.get('range');
const row = (testid: string, text: string) =>
  $(`//*[@data-testid="${testid}"][contains(normalize-space(.), "${text}")]`);

async function openLoaded(query = ''): Promise<void> {
  await openRelief({ size: { width: 1280, height: 800 }, query });
  await tid('pr-stats').waitForExist();
}

it('the control shows the range split into base, head and the number of commits', async () => {
  await openLoaded();
  await expect(tid('range-base')).toHaveText(MAIN);
  await expect(tid('range-head')).toHaveText(PROMO);
  await expect(tid('range-count')).toHaveText(expect.stringContaining('5 commits'));
  await expect(tid('range-swap')).toBeEnabled();
});

it('a range given in the URL is shown split in the control', async () => {
  await openLoaded('?range=feat/promo-codes..main');
  await expect(tid('range-base')).toHaveText(PROMO);
  await expect(tid('range-head')).toHaveText(MAIN);
});

it('base = a commit of the Commits tab and head = a branch load that diff', async () => {
  await openLoaded();
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '15');

  await tid('range-head').click();
  await tid('range-popover').waitForDisplayed();
  await tid('range-tab-branches').click();
  await row('range-option', PROMO).click();
  await tid('range-popover').waitForExist({ reverse: true });

  await tid('range-base').click();
  await tid('range-popover').waitForDisplayed();
  await tid('range-tab-commits').click();
  await row('range-commit', 'remise dans computeTotal').waitForDisplayed();
  // the commits of the range are highlighted; head is marked
  await expect(row('range-commit', 'champ code promo')).toHaveAttribute('data-mark', 'head');
  await expect(row('range-commit', 'formatPrice déplacé')).toHaveAttribute('data-mark', 'in');
  await row('range-commit', 'remise dans computeTotal').click();
  await tid('range-popover').waitForExist({ reverse: true });

  await expect(tid('range-head')).toHaveText(PROMO);
  await expect(tid('range-count')).toHaveText(expect.stringContaining('3 commits'));
  const range = await rangeParam();
  expect(range).toMatch(/^[0-9a-f]{7,40}\.\.\.feat\/promo-codes$/);
  const files = await tid('pr-stats').getAttribute('data-files');
  expect(files).not.toBe('15');
});

it('the filter narrows the commits by subject', async () => {
  await openLoaded();
  await tid('range-base').click();
  await tid('range-popover').waitForDisplayed();
  await tid('range-tab-commits').click();
  await row('range-commit', 'remise dans computeTotal').waitForDisplayed();
  await tid('range-filter').setValue('auth');
  await expect(row('range-commit', 'refresh() renvoie null')).toBeDisplayed();
  await expect(row('range-commit', 'remise dans computeTotal')).not.toExist();
});

it('swap exchanges base and head, the PR becomes empty', async () => {
  await openLoaded();
  await tid('range-swap').click();
  await expect(tid('range-base')).toHaveText(PROMO);
  await expect(tid('range-head')).toHaveText(MAIN);
  await expect(tid('pr-stats')).toHaveAttribute('data-files', '0');
  expect(await rangeParam()).toBe('feat/promo-codes...main');
});

it('the ... button switches to a direct diff (..) and back', async () => {
  await openLoaded();
  await tid('range-mode').click();
  await expect(tid('range-mode')).toHaveText('→');
  await browser.waitUntil(async () => (await rangeParam()) === 'main..feat/promo-codes');
  expect(await rangeParam()).toBe('main..feat/promo-codes');
  await tid('range-mode').click();
  await expect(tid('range-mode')).toHaveText('···→');
  await browser.waitUntil(async () => (await rangeParam()) === 'main...feat/promo-codes');
  expect(await rangeParam()).toBe('main...feat/promo-codes');
});

it('head offers the working tree, base does not, and swap is disabled on it', async () => {
  await openLoaded();
  await tid('range-base').click();
  await tid('range-popover').waitForDisplayed();
  await expect(row('range-option', 'Working tree')).not.toExist();
  await browser.keys('Escape');
  await tid('range-popover').waitForExist({ reverse: true });

  await tid('range-head').click();
  await tid('range-popover').waitForDisplayed();
  await row('range-option', 'Working tree').click();
  await expect(tid('range-head')).toHaveText(expect.stringContaining('Working tree'));
  await expect(tid('range-swap')).toBeDisabled();
});

it('b opens the base popover, Escape closes it', async () => {
  await openLoaded();
  await browser.keys('b');
  await tid('range-popover').waitForDisplayed();
  await browser.keys('Escape');
  await tid('range-popover').waitForExist({ reverse: true });
  await browser.keys('h');
  await tid('range-popover').waitForDisplayed();
});
