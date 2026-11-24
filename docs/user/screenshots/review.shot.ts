import { $, $$, browser } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { clearReviewState } from '../../../tests/e2e/helpers/review-state';
import { press, toggleLayer, typeText } from '../../../tests/e2e/helpers/ui';
import { languages, shot } from './shots';

const size = { width: 1600, height: 900 };

// The map with the diff layer at file level (main...feat/promo-codes), once per documentation language.
for (const lang of languages) {
  it(`review: diff layer on the map (${lang})`, async () => {
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    await $('[data-testid="level-2"]').click();
    await $('[data-testid="current-level"][data-level="2"]').waitForExist();
    await $('[data-diff-status="added"]').waitForDisplayed();
    await browser.pause(700); // end of the framing animation
    await browser.saveScreenshot(shot(lang, 'review-map'));
  });
}

// The PR card (top of the left sidebar).
for (const lang of languages) {
  it(`review: PR card (${lang})`, async () => {
    await openRelief({ lang, size });
    const card = $('[data-testid="pr-stats"]');
    await card.waitForDisplayed();
    await card.saveScreenshot(shot(lang, 'review-card'));
  });
}

// The structural diff of SessionStore.refresh (breaking signature), in the selected node panel.
for (const lang of languages) {
  it(`review: structural diff panel (${lang})`, async () => {
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    await press('/');
    await typeText('SessionStore.refresh');
    await $('[data-testid="search-results"]').waitForDisplayed();
    await press('Enter');
    const panel = $('[data-testid="diff-panel"]');
    await panel.$('[data-testid="signature-badge"]').waitForDisplayed();
    await panel.$('[data-testid="diff-line"][data-kind="added"]').waitForDisplayed();
    await panel.saveScreenshot(shot(lang, 'review-diff-panel'));
  });
}

// The structural overview (right panel, nothing selected) and the signals (left sidebar).
for (const lang of languages) {
  it(`review: structural overview and signals (${lang})`, async () => {
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    const overview = $('app-structural-overview');
    await overview.$('[data-testid="overview-group"]').waitForDisplayed();
    await overview.saveScreenshot(shot(lang, 'review-overview'));
    const signals = $('app-signals-section');
    await signals.$('[data-testid="signals-count"]').waitForDisplayed();
    await signals.saveScreenshot(shot(lang, 'review-signals'));
  });
}

// The impact radius section of SessionStore.refresh, in the selected node panel.
for (const lang of languages) {
  it(`review: impact radius section (${lang})`, async () => {
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    await press('/');
    await typeText('SessionStore.refresh');
    await $('[data-testid="search-results"]').waitForDisplayed();
    await press('Enter');
    const section = $('app-impact-section');
    await section.$('[data-testid="impact-count"]').waitForDisplayed();
    await section.saveScreenshot(shot(lang, 'review-impact'));
  });
}

// The reading order section (File mode), in the left sidebar.
for (const lang of languages) {
  it(`review: reading order section (${lang})`, async () => {
    clearReviewState();
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    const section = $('app-reading-order-section');
    await section.$('[data-testid="reading-row"]').waitForDisplayed();
    await section.saveScreenshot(shot(lang, 'review-reading-order'));
  });
}

// Commit mode of the reading order, the auth commit replayed on the map.
for (const lang of languages) {
  it(`review: replay one commit (${lang})`, async () => {
    clearReviewState();
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    await $('[data-testid="reading-mode-commit"]').click();
    await $('[data-testid="commit-row"]').waitForDisplayed();
    const rows = await $$('[data-testid="commit-row"]');
    for (const row of rows) {
      if ((await row.getText()).includes('refactor(auth): refresh() renvoie null')) {
        await row.click();
        break;
      }
    }
    await $('[data-testid="commit-row"][data-selected="true"]').waitForExist();
    await browser.pause(1200); // end of the framing animation
    await browser.saveScreenshot(shot(lang, 'review-commits'));
  });
}

// The Layers section (left sidebar), PR focus on.
for (const lang of languages) {
  it(`review: layers section (${lang})`, async () => {
    clearReviewState();
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    await press('f');
    await $('[data-testid="toggle-focus-layer"][aria-checked="true"]').waitForExist();
    await toggleLayer('toggle-unchanged-edges');
    await $('[data-testid="toggle-unchanged-edges"][aria-checked="false"]').waitForExist();
    await $('[data-testid="layers-section"]').saveScreenshot(shot(lang, 'review-layers'));
  });
}
