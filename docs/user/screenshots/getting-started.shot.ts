import { $, browser } from '@wdio/globals';
import { openRelief } from '../../../tests/e2e/helpers/open-relief';
import { waitForScene } from '../../../tests/e2e/helpers/map-scene';
import { languages, shot } from './shots';

// The home screen, then the map at the files level, once per documentation language.
for (const lang of languages) {
  it(`getting-started: home screen (${lang})`, async () => {
    await openRelief({ lang, size: { width: 1280, height: 720 } });
    await browser.saveScreenshot(shot(lang, 'home'));
    await waitForScene((s) => s.nodes.length > 0);
    await $('[data-testid="level-2"]').click();
    await browser.pause(800);
    await browser.saveScreenshot(shot(lang, 'getting-started-files'));
  });
}
