import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press, tid } from '../helpers/ui';

const isDark = () => browser.execute(() => document.documentElement.classList.contains('dark'));
const focusedTestId = () =>
  browser.execute(() => document.activeElement?.getAttribute('data-testid') ?? null);
const SIZE = { width: 1280, height: 800 };

it('the top bar has the Workspace, Settings and Help menus on the left, all closed', async () => {
  await openRelief({ size: SIZE });
  await expect(tid('menu-trigger-workspace')).toHaveText('Workspace');
  await expect(tid('menu-trigger-settings')).toHaveText('Settings');
  await expect(tid('menu-trigger-help')).toHaveText('Help');
  await expect(tid('menu-panel')).not.toBeDisplayed();
});

it('the U15 settings button is gone, the range picker is still in the top bar', async () => {
  await openRelief({ size: SIZE });
  await expect(tid('settings-button')).not.toExist();
  await expect(tid('settings-menu')).not.toExist();
  await expect(tid('compare-destination')).toBeDisplayed();
});

it('Settings > Theme changes the theme', async () => {
  await openRelief({ size: SIZE });
  await tid('menu-trigger-settings').click();
  await tid('menu-item-theme-dark').click();
  expect(await isDark()).toBe(true);
  await tid('menu-trigger-settings').click();
  await tid('menu-item-theme-light').click();
  expect(await isDark()).toBe(false);
});

it('Settings > Language switches the language of the menus', async () => {
  await openRelief({ size: SIZE });
  await tid('menu-trigger-settings').click();
  await tid('menu-item-language-fr').click();
  await expect(tid('menu-trigger-settings')).toHaveText('Paramètres');
  await expect(tid('menu-trigger-workspace')).toHaveText('Espace de travail');
  await expect(tid('menu-trigger-help')).toHaveText('Aide');
  await tid('menu-trigger-settings').click();
  await tid('menu-item-language-en').click();
  await expect(tid('menu-trigger-settings')).toHaveText('Settings');
});

it('Settings > Shortcuts opens the shortcuts help and closes the menu', async () => {
  await openRelief({ size: SIZE });
  await tid('menu-trigger-settings').click();
  await tid('menu-item-shortcuts').click();
  await expect(tid('shortcuts-help')).toBeDisplayed();
  await expect(tid('menu-panel')).not.toBeDisplayed();
});

it('Help > Documentation opens the docs window', async () => {
  await openRelief({ size: SIZE });
  const before = await browser.getWindowHandles();
  await tid('menu-trigger-help').click();
  await tid('menu-item-docs').click();
  await browser.waitUntil(async () => (await browser.getWindowHandles()).length > before.length, {
    timeoutMsg: 'Documentation did not open a second window',
  });
  const docs = (await browser.getWindowHandles()).find((handle) => !before.includes(handle));
  if (!docs) throw new Error('no docs window');
  await browser.switchToWindow(docs);
  await browser.closeWindow();
  await browser.switchToWindow(before[0]);
});

it('Workspace lists the four entries, the multi-repo ones disabled with a tooltip', async () => {
  await openRelief({ size: SIZE });
  await tid('menu-trigger-workspace').click();
  await expect(tid('menu-item-open-repo')).toHaveText('Open a repository…');
  await expect(tid('menu-item-open-workspace')).toHaveText('Open a workspace…');
  await expect(tid('menu-item-add-repo')).toHaveText('Add a repository to the workspace…');
  await expect(tid('menu-item-open-as-workspace')).toHaveText(
    'Open this repository as a workspace',
  );
  for (const id of ['open-workspace', 'add-repo', 'open-as-workspace']) {
    await expect(tid(`menu-item-${id}`)).toHaveAttribute('aria-disabled', 'true');
    expect(await tid(`menu-item-${id}`).getAttribute('title')).toBeTruthy();
  }
});

it('Alt + letter opens a menu, arrows move through it, Enter picks, Escape closes', async () => {
  await openRelief({ size: SIZE });
  await browser.keys(['Alt', 's']);
  await expect(tid('menu-item-theme-light')).toBeDisplayed();
  expect(await focusedTestId()).toBe('menu-item-theme-light');
  await press('ArrowDown');
  expect(await focusedTestId()).toBe('menu-item-theme-dark');
  await press('Enter');
  expect(await isDark()).toBe(true);
  await expect(tid('menu-panel')).not.toBeDisplayed();

  await browser.keys(['Alt', 's']);
  await press('ArrowRight');
  await expect(tid('menu-item-docs')).toBeDisplayed();
  await press('ArrowLeft');
  await press('ArrowLeft');
  await expect(tid('menu-item-open-repo')).toBeDisplayed();
  await press('Escape');
  await expect(tid('menu-panel')).not.toBeDisplayed();
  expect(await focusedTestId()).toBe('menu-trigger-workspace');
});

it('a click outside closes the menu', async () => {
  await openRelief({ size: SIZE });
  await tid('menu-trigger-settings').click();
  await expect(tid('menu-panel')).toBeDisplayed();
  await tid('repo-name').click();
  await expect(tid('menu-panel')).not.toBeDisplayed();
});
