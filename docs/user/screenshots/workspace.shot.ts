// @workspace shop-space
import { $, browser } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { waitForNode } from '../../../tests/e2e/helpers/map-scene';
import { languages, shot } from './shots';

const size = { width: 1600, height: 900 };

// The workspace shop-space (web + api) at the Repos level, once per language.
for (const lang of languages) {
  it(`workspace: Repos level (${lang})`, async () => {
    await openRelief({ lang, size });
    await $('[data-testid="level-0"]').click();
    await waitForNode('repo:web');
    await waitForNode('repo:api');
    await browser.pause(800); // end of the framing animation
    await browser.saveScreenshot(shot(lang, 'workspace-map'));
  });
}

// The per-repository comparisons menu (left panel), once per language.
for (const lang of languages) {
  it(`workspace: per-repository comparisons (${lang})`, async () => {
    await openRelief({ lang, size });
    await $('[data-testid="repo-comparisons-button"]').click();
    await $('[data-testid="repo-comparison"]').waitForDisplayed();
    await $('app-repo-comparisons').saveScreenshot(shot(lang, 'workspace-comparisons'));
  });
}
