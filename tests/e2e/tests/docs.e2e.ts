import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

const pages = ['getting-started', 'map', 'review', 'rules', 'explore', 'cli', 'about'];

type Handles = { main: string; docs: string };

/** Opens the Help menu and clicks Documentation, then switches to the docs window it opens (label `docs`). */
async function openDocsWindow(_uiLanguage: string): Promise<Handles> {
  const main = await browser.getWindowHandle();
  const before = await browser.getWindowHandles();
  await tid('menu-trigger-help').click();
  await tid('menu-item-docs').click();
  await browser.waitUntil(async () => (await browser.getWindowHandles()).length > before.length, {
    timeoutMsg: 'the Help link did not open a second window',
  });
  const docs = (await browser.getWindowHandles()).find((handle) => !before.includes(handle));
  if (!docs) throw new Error('no docs window');
  await browser.switchToWindow(docs);
  await $('h1').waitForDisplayed();
  return { main, docs };
}

async function closeDocsWindow(handles: Handles): Promise<void> {
  await browser.switchToWindow(handles.docs);
  await browser.closeWindow();
  await browser.switchToWindow(handles.main);
}

describe('docs in the app', () => {
  let handles: Handles | undefined;

  afterEach(async () => {
    if (handles) await closeDocsWindow(handles);
    handles = undefined;
  });

  it('the Help link opens a second window on the docs home, in English when the UI is in English', async () => {
    await openRelief({ lang: 'en' });

    handles = await openDocsWindow('Help');

    await expect(browser).toHaveUrl(expect.stringMatching(/\/docs\/en\/(index\.html)?$/));
    await expect($('h1')).toBeDisplayed();
    await expect($('html')).toHaveAttribute('lang', 'en');
  });

  it('the Help link opens the docs home in French when the UI is in French', async () => {
    await openRelief({ lang: 'fr' });

    handles = await openDocsWindow('Aide');

    await expect(browser).toHaveUrl(expect.stringMatching(/\/docs\/(index\.html)?$/));
    await expect($('h1')).toBeDisplayed();
    await expect($('html')).toHaveAttribute('lang', 'fr');
  });

  describe('pages', () => {
    beforeEach(async () => {
      await openRelief({ lang: 'en' });
      handles = await openDocsWindow('Help');
    });

    for (const slug of pages) {
      it(`docs page ${slug} answers in French (root) with a level-1 heading`, async () => {
        await browser.url(`/docs/${slug}/`);
        await expect($$('h1')).toBeElementsArrayOfSize(1);
      });

      it(`docs page ${slug} answers in English (/en) with a level-1 heading`, async () => {
        await browser.url(`/docs/en/${slug}/`);
        await expect($$('h1')).toBeElementsArrayOfSize(1);
      });
    }

    const gettingStarted = [
      { lang: 'French', path: '/docs/getting-started/' },
      { lang: 'English', path: '/docs/en/getting-started/' },
    ];

    for (const { lang, path } of gettingStarted) {
      it(`getting-started (${lang}) shows at least two loaded screenshots`, async () => {
        await browser.url(path);
        const images = await $$('.sl-markdown-content img');
        expect(images.length).toBeGreaterThanOrEqual(2);
        for (const image of images) {
          await image.scrollIntoView();
          await browser.waitUntil(() =>
            browser.execute(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
              image as unknown as HTMLImageElement,
            ),
          );
        }
      });

      it(`getting-started (${lang}) gives the prerequisites, the install command, relief [path] [range] and .relief/`, async () => {
        await browser.url(path);
        const content = $('.sl-markdown-content');
        await expect(content).toHaveText(expect.stringContaining('webkit2gtk-4.1'));
        await expect(content).toHaveText(
          expect.stringContaining('cargo install --path src/interfaces/relief-desktop'),
        );
        await expect(content).toHaveText(expect.stringContaining('relief [path] [range]'));
        await expect(content).toHaveText(expect.stringContaining('.relief/'));
        await expect(content).not.toHaveText(expect.stringContaining('relief serve'));
      });
    }
  });
});
