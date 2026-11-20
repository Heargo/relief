import { $, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { poll, tid, tids } from '../helpers/ui';

// Contract with the UI, on acme-shop main...feat/promo-codes (French UI, texts from the ticket):
//  - the left bar has `rules-section` with one `rule-row` per rule of relief.config.yaml, carrying
//    `data-rule` (the id); the text of a row holds the id and its status: "1 introduite",
//    "respectée" or "1 existante";
//  - clicking a `rule-row` selects the offending edge: the `edge-panel` opens and says
//    "existait déjà sur main" for an existing violation;
//  - `rules-view-file` ("Voir le fichier") shows the text of relief.config.yaml in `rules-file`,
//    inside the app.
async function rowOf(rule: string) {
  const rows = await tids('rule-row');
  for (const row of rows) {
    if ((await row.getAttribute('data-rule')) === rule) return row;
  }
  throw new Error(`rule row ${rule} not found`);
}

describe('architecture rules in the map', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ lang: 'fr', size: { width: 3200, height: 2000 } });
  });

  it('lists the 3 rules with their introduced / respected / existing status', async () => {
    await tid('rules-section').waitForDisplayed();
    await poll(
      async () => (await tids('rule-row')).length,
      (n) => n === 3,
    );
    await expect(await rowOf('web-sans-db')).toHaveText(expect.stringContaining('1 introduite'));
    await expect(await rowOf('packages-sans-apps')).toHaveText(
      expect.stringContaining('respectée'),
    );
    await expect(await rowOf('routes-via-repos')).toHaveText(
      expect.stringContaining('1 existante'),
    );
  });

  it('clicking routes-via-repos opens the edge panel saying it already existed on main', async () => {
    await tid('rules-section').waitForDisplayed();
    // The rows come with the summary; the map (nodes and edges) loads on its own.
    await $('[data-testid="map-edge"]').waitForExist({ timeout: 15000 });
    await (await rowOf('routes-via-repos')).click();
    await expect(tid('edge-panel')).toBeDisplayed();
    await expect(tid('edge-panel')).toHaveText(expect.stringContaining('existait déjà sur main'));
  });

  it('"Voir le fichier" shows the YAML of acme-shop in the app', async () => {
    await tid('rules-section').waitForDisplayed();
    await tid('rules-view-file').click();
    await expect(tid('rules-file')).toBeDisplayed();
    await expect(tid('rules-file')).toHaveText(expect.stringContaining('rules:'));
    await expect(tid('rules-file')).toHaveText(expect.stringContaining('id: routes-via-repos'));
    await expect(tid('rules-file')).toHaveText(
      expect.stringContaining('deny: packages/db/schema/**'),
    );
    await expect($('body')).not.toHaveText(expect.stringContaining('undefined'));
  });
});
