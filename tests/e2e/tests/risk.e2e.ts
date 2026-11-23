import { expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { sceneNodes, settledNodeCount, waitForScene } from '../helpers/map-scene';
import { poll, tid, tids } from '../helpers/ui';

// Contract with the UI, on acme-shop main...feat/promo-codes (French UI), exploration mode:
//  - the left bar has `hotspots-section` ("Hotspots") with one `hotspot-row` per symbol of the top
//    6 by risk (carrying `data-node-id`); on acme-shop it lists exactly 6 symbols;
//  - the `layers-section` has `toggle-risk-layer` ("Carte de risque", `aria-pressed`), off by
//    default; while on, each node of the map scene has a `risk` (0 to 4) and at least one node
//    has a level above 0; off, `risk` is null;
//  - the node panel of a selected hotspot shows a `node-metrics` block.
async function tintedCount(): Promise<number> {
  return (await sceneNodes()).filter((n) => (n.risk ?? 0) > 0).length;
}

const riskOff = async () => (await sceneNodes()).every((n) => n.risk === null);

describe('hotspots and risk map', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ lang: 'fr', size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await settledNodeCount();
    await waitForScene((s) => s.edges.length > 0, 15000);
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
    expect(await riskOff()).toBe(true);
    await tid('toggle-risk-layer').click();
    await expect(tid('toggle-risk-layer')).toHaveAttribute('aria-checked', 'true');
    await poll(tintedCount, (n) => n > 0);
    await tid('toggle-risk-layer').click();
    await expect(tid('toggle-risk-layer')).toHaveAttribute('aria-checked', 'false');
    await poll(riskOff, (off) => off);
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
