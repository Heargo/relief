import { $, browser } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { clearReviewState } from '../../../tests/e2e/helpers/review-state';
import { languages, shot } from './shots';

const size = { width: 1600, height: 900 };

// Explore mode: the entry points and the overview (left sidebar), once per language.
for (const lang of languages) {
  it(`explore: entry points and overview (${lang})`, async () => {
    clearReviewState();
    await openRelief({ lang, size });
    await $('[data-testid="explore-toggle"]').waitForDisplayed();
    await $('[data-testid="explore-toggle"]').click();
    const section = $('[data-testid="entry-points-section"]');
    await section.$('[data-testid="entry-point-row"]').waitForDisplayed();
    await section.saveScreenshot(shot(lang, 'explore-entry-points'));
  });
}

// Explore mode: the Hotspots section (left sidebar), once per language.
for (const lang of languages) {
  it(`explore: hotspots (${lang})`, async () => {
    clearReviewState();
    await openRelief({ lang, size });
    await $('[data-testid="explore-toggle"]').waitForDisplayed();
    await $('[data-testid="explore-toggle"]').click();
    const section = $('[data-testid="hotspots-section"]');
    await section.$('[data-testid="hotspot-row"]').waitForDisplayed();
    await browser.waitUntil(
      async () => (await section.$$('[data-testid="hotspot-row"]').length) === 6,
    );
    await section.scrollIntoView({ block: 'end' });
    await section.saveScreenshot(shot(lang, 'explore-hotspots'));
  });
}
