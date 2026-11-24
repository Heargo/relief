import { $, browser } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { waitForScene } from '../../../tests/e2e/helpers/map-scene';
import { languages, shot } from './shots';

// The map at the files level, once per documentation language.
for (const lang of languages) {
  it(`getting-started: files level (${lang})`, async () => {
    await openRelief({ lang, size: { width: 1280, height: 720 } });
    await waitForScene((s) => s.nodes.length > 0);
    await $('[data-testid="level-2"]').click();
    await browser.pause(800);
    await browser.saveScreenshot(shot(lang, 'getting-started-files'));
  });
}
