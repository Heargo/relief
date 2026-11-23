import { $, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { settledNodeCount, waitForScene } from '../helpers/map-scene';
import { poll, tid, tids } from '../helpers/ui';

// Contract with the UI, on acme-shop main...feat/promo-codes (French UI), exploration mode:
//  - a click on an `entry-point-row` ("POST /checkout") selects the node (`selected-node`) and
//    opens its impact in the "dependencies" direction (`impact-direction`, button
//    `data-value="dependencies"` pressed);
//  - `impact-row` lists what the flow reaches, down to the externals (labelled by package, here stripe-sdk).
describe('flow trace from an entry point', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ lang: 'fr', size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await settledNodeCount();
    await waitForScene((s) => s.edges.length > 0, 15000);
    await tid('explore-toggle').click();
    await tid('entry-points-section').waitForDisplayed();
  });

  it('POST /checkout lists chargeCustomer and computeTotal and reaches stripe-sdk', async () => {
    const route = await $('[data-testid="entry-point-row"]=POST /checkout');
    await route.waitForDisplayed();
    await route.click();

    await expect(tid('selected-node')).toHaveAttribute(
      'data-node-id',
      expect.stringMatching(/sym:postCheckout$/),
    );
    await expect($('[data-testid="impact-direction"] [data-value="dependencies"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const rows = async () => {
      const out: string[] = [];
      for (const row of await tids('impact-row')) out.push(await row.getText());
      return out.join('\n');
    };
    await poll(
      async () => await rows(),
      (text) => text.includes('chargeCustomer'),
      10000,
    );
    const text = await rows();
    expect(text).toContain('chargeCustomer');
    expect(text).toContain('computeTotal');
    expect(text).toContain('stripe-sdk');
  });
});
