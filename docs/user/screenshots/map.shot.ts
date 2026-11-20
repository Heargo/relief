import { $, browser } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { press, typeText } from '../../../tests/e2e/helpers/ui';
import { languages, shot } from './shots';

// The map screen (top bar and three columns), once per documentation language.
for (const lang of languages) {
  it(`map: screen (${lang})`, async () => {
    await openRelief({ lang, size: { width: 1280, height: 720 } });
    await $('[data-testid="map-node"]').waitForDisplayed();
    await $('[data-testid="map-edge"]').waitForExist();
    await browser.saveScreenshot(shot(lang, 'map'));
  });
}

// Search and breadcrumbs: `/`, `refresh`, Enter selects SessionStore.refresh.
for (const lang of languages) {
  it(`map: search and breadcrumbs (${lang})`, async () => {
    await openRelief({ lang, size: { width: 1280, height: 720 } });
    await $('[data-testid="map-node"]').waitForDisplayed();
    await press('/');
    await typeText('refresh');
    await press('Enter');
    await $(
      '//*[@data-testid="breadcrumbs"][contains(., "SessionStore.refresh")]',
    ).waitForDisplayed();
    await browser.pause(700); // end of the framing animation
    await browser.saveScreenshot(shot(lang, 'map-search'));
  });
}
