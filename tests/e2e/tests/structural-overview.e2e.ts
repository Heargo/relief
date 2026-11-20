import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency), on main...feat/promo-codes:
//  - with nothing selected, the right panel shows the overview: groups are
//    `data-testid="overview-group"` with `data-group` (signatures | violations | files | out-of-diff),
//    rows are `overview-row` with `data-node-id`, badges `tested-badge` with `data-tested`;
//  - the left bar has a "Signals" section whose rows are `signal-row` with `data-kind`.
const REQUIRE_AUTH = 'pkg:@acme/api/routes::file:apps/api/routes/middleware.ts::sym:requireAuth';
const RENEW = 'pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscriptions';
const OUT_OF_DIFF = '[data-testid="overview-group"][data-group="out-of-diff"]';

it('the overview lists the callers out of the diff and a click selects one', async () => {
  await openRelief();

  await expect($(OUT_OF_DIFF)).toBeDisplayed();
  const auth = $(`${OUT_OF_DIFF} [data-testid="overview-row"][data-node-id="${REQUIRE_AUTH}"]`);
  const renew = $(`${OUT_OF_DIFF} [data-testid="overview-row"][data-node-id="${RENEW}"]`);
  await expect(auth).toHaveText(expect.stringContaining('requireAuth'));
  await expect(auth.$('[data-testid="tested-badge"]')).toHaveAttribute('data-tested', 'true');
  await expect(renew).toHaveText(expect.stringContaining('renewSubscriptions'));
  await expect(renew.$('[data-testid="tested-badge"]')).toHaveAttribute('data-tested', 'false');

  await renew.click();

  await expect(tid('selected-node')).toHaveAttribute('data-node-id', RENEW);
});

it('the signals section flags the breaking signature and the new couplings', async () => {
  await openRelief();

  const left = '[data-testid="left-panel"]';
  await expect(
    $$(
      `//*[@data-testid="left-panel"]//*[@data-testid="signal-row"][@data-kind="breaking"][contains(., "SessionStore.refresh")]`,
    ),
  ).toBeElementsArrayOfSize(1);
  await expect(
    $$(`${left} [data-testid="signal-row"][data-kind="new-coupling"]`),
  ).toBeElementsArrayOfSize(4);
  // The 4th is the HTTP edge PromoCodeInput -> postPromoValidate (T04).
  await expect(
    $$(
      `//*[@data-testid="left-panel"]//*[@data-testid="signal-row"][@data-kind="new-coupling"][contains(., "apps/web/components → apps/api/routes")]`,
    ),
  ).toBeElementsArrayOfSize(1);
  await expect(
    $$(`${left} [data-testid="signal-row"][data-kind="removed-coupling"]`),
  ).toBeElementsArrayOfSize(1);
});
