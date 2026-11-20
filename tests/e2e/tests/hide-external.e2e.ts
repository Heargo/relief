import { $, browser, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { count, tid } from '../helpers/ui';

// Contract with the UI, on main...feat/promo-codes:
//  - the left panel has a `toggle-hide-external` button (`aria-checked`), on by default;
//  - while it is on, no `map-node` has a `data-node-id` starting with `pkg:external`; switching
//    it off shows the node `pkg:external` (the external group).

const EXTERNAL = '[data-testid="map-node"][data-node-id^="pkg:external"]';

describe('hide external dependencies', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief();
  });

  it('hides them at load, and shows the external group once switched off', async () => {
    await expect(tid('toggle-hide-external')).toHaveAttribute('aria-checked', 'true');
    expect(await count(EXTERNAL)).toBe(0);

    await tid('toggle-hide-external').click();
    await expect(tid('toggle-hide-external')).toHaveAttribute('aria-checked', 'false');
    await browser.waitUntil(async () => (await count(EXTERNAL)) > 0, {
      timeout: 8000,
      timeoutMsg: 'the external group never appeared',
    });
    await expect($('[data-testid="map-node"][data-node-id="pkg:external"]')).toBeExisting();
  });
});
