import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickNode, sceneEdge, sceneEdges, waitForScene } from '../helpers/map-scene';
import { press, tid } from '../helpers/ui';

// Contract with the UI, on acme-shop (main...feat/promo-codes), level 2 (modules), read from the map
// scene (`emphasis` of the aggregated edges):
//  - selecting an open module gives the emphasis `hidden` (no visible stroke) to the edges between
//    its own children (here payment.ts -> invoice.ts inside apps/api);
//  - its edges to the outside keep `out` / `in`;
//  - Escape brings the internal edges back.
const API = 'pkg:@acme/api';
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';
const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';

const emphasisOf = async () => (await sceneEdge(PAYMENT, INVOICE))?.emphasis;

describe('internal edges of the selected node', () => {
  it('are hidden once the module is selected, and come back on Escape', async () => {
    await openRelief({ size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await waitForScene((s) => s.edges.some((e) => e.from === PAYMENT && e.to === INVOICE), 15000);
    expect(await emphasisOf()).not.toBe('hidden');

    await clickNode(API);
    await waitForScene((s) => s.edges.some((e) => e.emphasis === 'out' || e.emphasis === 'in'));

    await browser.waitUntil(async () => (await emphasisOf()) === 'hidden', {
      timeout: 5000,
      timeoutMsg: 'internal edge never got the hidden emphasis',
    });
    expect(
      (await sceneEdges()).filter((e) => e.emphasis === 'out' || e.emphasis === 'in').length,
    ).toBeGreaterThan(0);

    await press('Escape');
    await browser.waitUntil(async () => (await emphasisOf()) !== 'hidden', {
      timeout: 5000,
      timeoutMsg: 'internal edge stayed hidden after Escape',
    });
  });
});
