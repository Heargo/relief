// @workspace shop-space
import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickNode, doubleClickNode, waitForNode, waitForScene } from '../helpers/map-scene';
import { tid, tids } from '../helpers/ui';

// Ticket K08, on the workspace `tests/fixtures/shop-space`: two repositories, `web` (front, branch
// feat/order-badge) and `api` (back, branch feat/order-total), each compared with main by the
// workspace file. The app is opened on the workspace folder, in review mode, so the map shows the
// diff of both repositories with no range to pick.
//  - the map has a level Repos above Systems: five level buttons (`level-0` is Repos), and
//    a `repo:<name>` box per repository (kind `repo`) with its name, its branch (`sub`) and its
//    labels (`tags`) in the scene;
//  - a double click on a repository box zooms into it: its systems or modules show;
//  - the files changed in each repository are marked `modified` in the same scene.
const WEB_ORDER_LIST = 'repo:web/pkg:shop-web/src::file:src/OrderList.ts';
const WEB_MAIN = 'repo:web/pkg:shop-web/src::file:src/main.ts';
const API_ORDERS = 'repo:api/pkg:shop-api/src::file:src/orders.ts';
const API_SERVER = 'repo:api/pkg:shop-api/src::file:src/server.ts';

const SIZE = { width: 1280, height: 800 };

it('opens the workspace by its name, with the level Repos above the others', async () => {
  await openRelief({ size: SIZE });
  await expect(tid('repo-name')).toHaveText('shop');
  await expect(tid('level-0')).toHaveText(expect.stringContaining('Repos'));
  await expect(tid('level-4')).toExist();
  await expect(tid('level-5')).not.toExist();
});

it('shows a box per repository with its name, branch and labels', async () => {
  await openRelief({ size: SIZE });
  await tid('level-0').click();
  const web = await waitForNode('repo:web');
  const api = await waitForNode('repo:api');
  expect([web.kind, api.kind]).toEqual(['repo', 'repo']);
  expect([web.label, api.label]).toEqual(['web', 'api']);
  expect([web.sub, api.sub]).toEqual(['feat/order-badge', 'feat/order-total']);
  expect([web.tags, api.tags]).toEqual([['front'], ['back']]);
});

it('zooms into a repository with a double click on its box', async () => {
  await openRelief({ size: SIZE });
  await tid('level-0').click();
  await waitForNode('repo:web');
  await doubleClickNode('repo:web');
  await waitForScene((s) =>
    s.nodes.some((n) => n.id.startsWith('repo:web/') && n.mode !== 'ghost'),
  );
  await clickNode('repo:web');
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', 'repo:web');
});

it('shows the diff of both repositories on the same map', async () => {
  await openRelief({ size: SIZE });
  await tid('level-3').click();
  expect((await waitForNode(WEB_ORDER_LIST)).status).toBe('modified');
  expect((await waitForNode(API_ORDERS)).status).toBe('modified');
  expect((await waitForNode(WEB_MAIN)).status).toBe('unchanged');
  expect((await waitForNode(API_SERVER)).status).toBe('unchanged');
});
