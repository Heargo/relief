// @fixture tiny
// @welcome
import { browser, expect } from '@wdio/globals';
import { tid, tids } from '../helpers/ui';

// The app is started without argument, and `tiny` is its only recent repository.
it('relief without a path shows the welcome screen, no map', async () => {
  await browser.execute(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'en');
  });
  await browser.execute(() => window.location.assign('/'));
  await expect(tid('welcome')).toBeDisplayed();
  await expect(tid('welcome-open-repo')).toBeDisplayed();
  await expect(tid('welcome-open-workspace')).toBeDisabled();
  await expect(tid('repo-name')).not.toExist();
});

it('lists the recent repository and opens its map in the same window', async () => {
  const handles = await browser.getWindowHandles();
  const recents = await tids('welcome-recent');
  expect(recents).toHaveLength(1);
  await expect(recents[0]).toHaveText(expect.stringContaining('tiny'));
  await recents[0].click();
  await tid('repo-name').waitForDisplayed();
  await expect(tid('repo-name')).toHaveText('tiny');
  await expect(tid('welcome')).not.toExist();
  expect(await browser.getWindowHandles()).toEqual(handles);
});
