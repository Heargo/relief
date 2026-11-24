// @fixture tiny
// @welcome
import { $, browser } from '@wdio/globals';
import { setViewport } from '../../../tests/e2e/helpers/open-relief';
import { languages, shot } from './shots';

// The welcome screen (relief started without a path, `tiny` as the only recent), once per language.
for (const lang of languages) {
  it(`welcome screen (${lang})`, async () => {
    await setViewport(1280, 720);
    await browser.execute((language: string) => {
      localStorage.clear();
      localStorage.setItem('lang', language);
    }, lang);
    await browser.execute(() => window.location.assign('/'));
    await $('[data-testid="welcome-recent"]').waitForDisplayed();
    await browser.saveScreenshot(shot(lang, 'home'));
  });
}
