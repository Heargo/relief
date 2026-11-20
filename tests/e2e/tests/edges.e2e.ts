import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { forceClick, tid } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - each aggregated edge is `data-testid="map-edge"` with `data-from`, `data-to` (node ids) and
//    `data-count` (number of fine links), and is clickable;
//  - the right panel of a selected edge is `data-testid="edge-panel"`; each fine link in it is
//    `data-testid="edge-link"` (text: "<from symbol> → <to symbol>");
//  - the selected symbol is `data-testid="selected-node"` with `data-node-id`.
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';

it('at the system level, apps/web -> packages/db lists validateCodeLocally -> findDiscountByCode', async () => {
  await openRelief();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');

  const edgeSelector = `[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"]`;
  await expect($$(edgeSelector)).toBeElementsArrayOfSize(1);
  expect(Number(await $(edgeSelector).getAttribute('data-count'))).toBeGreaterThanOrEqual(1);

  await forceClick(edgeSelector);
  await expect(tid('edge-panel')).toBeDisplayed();
  const linkSelector =
    '//*[@data-testid="edge-panel"]//*[@data-testid="edge-link"][contains(., "validateCodeLocally")][contains(., "findDiscountByCode")]';
  await expect($$(linkSelector)).toBeElementsArrayOfSize(1);

  await $(linkSelector).click();
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/::sym:validateCodeLocally$/),
  );
});
