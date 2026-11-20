import { $ } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { clearReviewState } from '../../../tests/e2e/helpers/review-state';
import { languages, shot } from './shots';

const size = { width: 1600, height: 900 };

// The Architecture rules section (left sidebar) on main...feat/promo-codes, once per language.
for (const lang of languages) {
  it(`rules: architecture rules section (${lang})`, async () => {
    clearReviewState();
    await openRelief({ lang, size });
    await $('[data-testid="pr-stats"]').waitForDisplayed();
    const section = $('[data-testid="rules-section"]');
    await section.$('[data-testid="rule-row"]').waitForDisplayed();
    await section.saveScreenshot(shot(lang, 'rules-section'));
  });
}
