import { $, $$, browser } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { press, tid } from '../helpers/ui';

// Contract with the UI, on acme-shop (main...feat/promo-codes), level 2 (modules):
//  - selecting an open module gives the `hidden` class (and no visible stroke) to the `g.edge` of
//    the aggregated edges between its own children (here payment.ts -> invoice.ts inside apps/api);
//  - its edges to the outside keep `out` / `in`;
//  - Escape brings the internal edges back.
const API = 'pkg:@acme/api';
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';
const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';

const edge = (from: string, to: string) =>
  `[data-testid="map-edge"][data-from="${from}"][data-to="${to}"]`;

async function edgeState(from: string, to: string) {
  return browser.execute(
    (sel: string) => {
      const g = document.querySelector(sel)?.closest('g.edge');
      if (!g) return null;
      return {
        classes: Array.from(g.classList),
        opacity: parseFloat(getComputedStyle(g).opacity),
        display: getComputedStyle(g).display,
        visibility: getComputedStyle(g).visibility,
      };
    },
    edge(from, to),
  );
}

describe('internal edges of the selected node', () => {
  it('are hidden once the module is selected, and come back on Escape', async () => {
    await openRelief({ size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await $(edge(PAYMENT, INVOICE)).waitForExist();
    expect((await edgeState(PAYMENT, INVOICE))?.classes).not.toContain('hidden');

    await $(`[data-testid="map-node"][data-node-id="${API}"] > .hd`).click();
    await $('g.edge.out, g.edge.in').waitForExist();

    await browser.waitUntil(
      async () => (await edgeState(PAYMENT, INVOICE))?.classes.includes('hidden') ?? false,
      { timeout: 5000, timeoutMsg: 'internal edge never got the hidden class' },
    );
    const internal = await edgeState(PAYMENT, INVOICE);
    expect(internal?.classes).not.toContain('dim');
    expect(
      internal?.display === 'none' || internal?.visibility === 'hidden' || internal?.opacity === 0,
    ).toBe(true);
    expect((await $$('g.edge.out, g.edge.in')).length).toBeGreaterThan(0);

    await press('Escape');
    await browser.waitUntil(
      async () => !((await edgeState(PAYMENT, INVOICE))?.classes.includes('hidden') ?? true),
      { timeout: 5000, timeoutMsg: 'internal edge stayed hidden after Escape' },
    );
  });
});
