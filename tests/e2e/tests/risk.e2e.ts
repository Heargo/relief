import { $, $$, browser, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { poll, tid, tids } from '../helpers/ui';

// Contract with the UI, on acme-shop main...feat/promo-codes (French UI), exploration mode:
//  - the left bar has `hotspots-section` ("Hotspots") with one `hotspot-row` per symbol of the top
//    6 by risk (carrying `data-node-id`); on acme-shop it lists exactly 6 symbols;
//  - the `layers-section` has `toggle-risk-layer` ("Carte de risque", `aria-pressed`), off by
//    default; while on, each `map-node` carries `data-risk-level` (0 to 4) and at least one node
//    has a level above 0; off, the attribute is absent;
//  - the node panel of a selected hotspot shows a `node-metrics` block.
async function mapNodeCount(): Promise<number> {
  return browser.execute(() => document.querySelectorAll('[data-testid="map-node"]').length);
}

async function settled(): Promise<void> {
  let previous = -1;
  await browser.waitUntil(
    async () => {
      const now = await mapNodeCount();
      const same = now > 0 && now === previous;
      previous = now;
      return same;
    },
    { timeout: 8000, interval: 600, timeoutMsg: 'the map never settled' },
  );
}

async function tintedCount(): Promise<number> {
  return browser.execute(
    () =>
      Array.from(document.querySelectorAll('[data-testid="map-node"][data-risk-level]')).filter(
        (n) => Number(n.getAttribute('data-risk-level')) > 0,
      ).length,
  );
}

describe('hotspots and risk map', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ lang: 'fr', size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await settled();
    await $('[data-testid="map-edge"]').waitForExist({ timeout: 15000 });
    await tid('explore-toggle').click();
    await tid('hotspots-section').waitForDisplayed();
  });

  it('the Hotspots section lists 6 symbols', async () => {
    await expect(tid('hotspots-section')).toHaveText(expect.stringMatching(/hotspots/i));
    await poll(
      async () => (await tids('hotspot-row')).length,
      (n) => n > 0,
    );
    const rows = await tids('hotspot-row');
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(await row.getAttribute('data-node-id')).toMatch(/::sym:/);
    }
  });

  it('the risk map layer tints the nodes and can be switched off', async () => {
    await expect(tid('toggle-risk-layer')).toHaveAttribute('aria-checked', 'false');
    await expect($$('[data-testid="map-node"][data-risk-level]')).toBeElementsArrayOfSize(0);
    await tid('toggle-risk-layer').click();
    await expect(tid('toggle-risk-layer')).toHaveAttribute('aria-checked', 'true');
    await poll(tintedCount, (n) => n > 0);
    await tid('toggle-risk-layer').click();
    await expect(tid('toggle-risk-layer')).toHaveAttribute('aria-checked', 'false');
    await expect($$('[data-testid="map-node"][data-risk-level]')).toBeElementsArrayOfSize(0);
  });

  it('a click on a hotspot selects it and its panel shows the metrics', async () => {
    await poll(
      async () => (await tids('hotspot-row')).length,
      (n) => n > 0,
    );
    const row = (await tids('hotspot-row'))[0];
    const id = await row.getAttribute('data-node-id');
    await row.click();
    await expect(tid('selected-node')).toHaveAttribute('data-node-id', id);
    await expect(tid('node-metrics')).toBeDisplayed();
  });
});
