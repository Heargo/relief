import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickNode, settledNode, waitForNodeMatching } from '../helpers/map-scene';
import { press, tid, typeText } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the right panel of a selected node is `data-testid="selected-node"`; its code is
//    `data-testid="node-code"`, one `code-line` (with `data-line`) per line;
//  - its callers / dependencies are `node-used-by` / `node-uses`, each link a `node-link`.
it('selecting computeTotal shows its code and its callers', async () => {
  await openRelief();
  await press('/');
  await typeText('computeTotal');
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');

  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/sym:computeTotal$/),
  );
  await expect(tid('node-code')).toHaveText(
    expect.stringContaining('export function computeTotal'),
  );
  await expect($('[data-testid="node-used-by"] [data-testid="node-link"]')).toBeDisplayed();
});

it('a plain click on the computeTotal box of the map selects it and shows its code', async () => {
  await openRelief();
  // Search frames the file so that the symbol box is on screen, then the selection is cleared.
  await press('/');
  await typeText('computeTotal');
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/sym:computeTotal$/),
  );
  const idEnding = async (suffix: string) =>
    (await waitForNodeMatching((id) => id.endsWith(suffix))).id;
  const renderInvoice = await idEnding('sym:renderInvoice');
  await settledNode(renderInvoice);
  await clickNode(renderInvoice);
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/sym:renderInvoice$/),
  );

  const computeTotal = await idEnding('sym:computeTotal');
  await settledNode(computeTotal);
  await clickNode(computeTotal);
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(/sym:computeTotal$/),
  );
  await expect(tid('node-code')).toHaveText(
    expect.stringContaining('export function computeTotal'),
  );
});
