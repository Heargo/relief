import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickEdge, sceneEdges, waitForScene } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// Contract with the UI: the edges are read through `window.__reliefScene()` (helpers/map-scene.ts):
// each aggregated edge has `from`, `to` (node ids) and `count` (number of fine links), and a click
// at its middle selects it;
//  - the right panel of a selected edge is `data-testid="edge-panel"`; each fine link in it is
//    `data-testid="edge-link"` (text: "<from symbol> → <to symbol>");
//  - the selected symbol is `data-testid="selected-node"` with `data-node-id`.
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';

it('at the system level, apps/web -> packages/db lists validateCodeLocally -> findDiscountByCode', async () => {
  await openRelief();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');

  await waitForScene((sc) => sc.edges.some((e) => e.from === WEB && e.to === DB));
  const edges = (await sceneEdges()).filter((e) => e.from === WEB && e.to === DB);
  expect(edges).toHaveLength(1);
  expect(edges[0].count).toBeGreaterThanOrEqual(1);

  await clickEdge(WEB, DB);
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
