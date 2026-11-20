import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { forceClick, press, tid } from '../helpers/ui';

// Contract with the UI, on acme-shop (main...feat/promo-codes), level 0, no impact layer:
//  - with a node selected, the `g.edge` of each aggregated edge carries `out` (starts at the node),
//    `in` (ends at it) or `dim` (all the others, computed opacity < 0.2); without selection none of
//    the three;
//  - with an edge selected, its `g.edge` carries `picked`, the others `dim`;
//  - Escape clears the selection and everything is back to normal.
const WEB = 'pkg:@acme/web';
const API = 'pkg:@acme/api';
const DB = 'pkg:@acme/db';

const edge = (from: string, to: string) =>
  `[data-testid="map-edge"][data-from="${from}"][data-to="${to}"]`;

async function edgeState(from: string, to: string) {
  return browser.execute(
    (sel: string) => {
      const g = document.querySelector(sel)?.closest('g.edge');
      if (!g) return null;
      const line = g.querySelector('.line') as SVGElement;
      return {
        classes: Array.from(g.classList),
        opacity: parseFloat(getComputedStyle(g).opacity),
        width: parseFloat(getComputedStyle(line).strokeWidth),
      };
    },
    edge(from, to),
  );
}

describe('selected node edges', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 } });
    await $(edge(WEB, API)).waitForExist();
    await $(edge(API, DB)).waitForExist();
    await $(edge(WEB, DB)).waitForExist();
  });

  it('out / in edges stand out, the others dim, Escape restores', async () => {
    const before = await edgeState(WEB, DB);
    expect(before?.classes).not.toContain('dim');

    await $(`[data-testid="map-node"][data-node-id="${API}"] > .hd`).click();
    await $('g.edge.out').waitForExist();

    await browser.waitUntil(async () => ((await edgeState(WEB, DB))?.opacity ?? 1) < 0.2, {
      timeout: 5000,
      timeoutMsg: 'dim edge never went under 0.2',
    });
    const out = await edgeState(API, DB);
    const incoming = await edgeState(WEB, API);
    const other = await edgeState(WEB, DB);
    expect(out?.classes).toContain('out');
    expect(out?.width).toBeGreaterThan(2);
    expect(incoming?.classes).toContain('in');
    expect(other?.classes).toContain('dim');
    expect(other?.opacity).toBeLessThan(0.2);
    expect(out?.opacity).toBeGreaterThan(0.5);

    await press('Escape');
    await browser.waitUntil(async () => (await $$('g.edge.dim').length) === 0, {
      timeout: 5000,
      timeoutMsg: 'edges stayed dim after Escape',
    });
    const after = await edgeState(API, DB);
    expect(after?.classes).not.toContain('out');
    expect(after?.classes).not.toContain('in');
  });

  it('a selected edge is the only one to stay sharp', async () => {
    await forceClick(edge(API, DB));
    await expect(tid('edge-panel')).toBeDisplayed();
    expect((await edgeState(API, DB))?.classes).toContain('picked');
    expect((await edgeState(WEB, API))?.classes).toContain('dim');
  });
});
