import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press, tid } from '../helpers/ui';

const isDark = () => browser.execute(() => document.documentElement.classList.contains('dark'));

it('the top bar has a single Settings button on the right, the menu is closed', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('settings-button')).toBeDisplayed();
  await expect(tid('settings-menu')).not.toBeDisplayed();
  await expect(tid('theme-toggle')).not.toBeDisplayed();
  await expect(tid('language-select')).not.toBeDisplayed();
});

it('changes the theme from the menu', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('settings-button').click();
  await tid('theme-toggle').$('button=Dark').click();
  expect(await isDark()).toBe(true);
  await tid('theme-toggle').$('button=Light').click();
  expect(await isDark()).toBe(false);
});

it('changes the language from the menu', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('settings-button').click();
  await tid('language-select').$('button=Français').click();
  await expect(tid('settings-button')).toHaveAttribute('aria-label', 'Paramètres');
  await tid('language-select').$('button=English').click();
  await expect(tid('settings-button')).toHaveAttribute('aria-label', 'Settings');
});

it('Shortcuts opens the help and closes the menu', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('settings-button').click();
  await tid('help-button').click();
  await expect(tid('shortcuts-help')).toBeDisplayed();
  await expect(tid('settings-menu')).not.toBeDisplayed();
});

it('Escape closes the menu', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('settings-button').click();
  await expect(tid('settings-menu')).toBeDisplayed();
  await press('Escape');
  await expect(tid('settings-menu')).not.toBeDisplayed();
});

it('a click outside closes the menu', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('settings-button').click();
  await expect(tid('settings-menu')).toBeDisplayed();
  await tid('repo-name').click();
  await expect(tid('settings-menu')).not.toBeDisplayed();
});
