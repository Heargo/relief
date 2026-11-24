// @fixtures shop-web shop-api
// @welcome
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $$, browser, expect } from '@wdio/globals';
import { clickEdge, sceneEdge, settledNode, waitForNode, waitForScene } from '../helpers/map-scene';
import { setViewport } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Ticket K13: the whole multi-repo journey, from the welcome screen. The app starts without
// argument and with no recent; `shop-web` and `shop-api` (tests/fixtures) are built next to each
// other in the temporary folder RELIEF_E2E_REPO, with no workspace.
//
// The native folder picker cannot be driven: `ReliefApiService.pickRepoFolder()` answers, in order,
// the paths queued in `window.__reliefE2ePicks` (a string[]) and only opens the dialog when the
// queue is empty or absent. Nothing sets it outside the e2e specs.
//
//  1. `welcome-create-workspace` asks for a repository (shop-web), then for a folder (<tmp>/space):
//     the app opens the workspace `shop-web.relief.json` created there.
//  2. Workspace > `menu-item-add-repo` asks for a repository (shop-api) and adds it.
//  3. Each `workspace-repo` row gets a label (`repo-labels-edit`, `repo-label-option-<label>`).
//  4. The default comparison of both repositories is their working tree against main, and both
//     fixtures are checked out on their feature branch: the changes of the front (OrderList) and
//     of the API (orders) are read on the same map.
//  5. At the level Repos, the edge shop-web -> shop-api (package import and HTTP call) can be selected.

const TMP = () => process.env['RELIEF_E2E_REPO'] as string;
const SPACE = () => join(TMP(), 'space');
const FILE = () => join(SPACE(), 'shop-web.relief.json');
const WEB_ORDER_LIST = 'repo:shop-web/pkg:shop-web/src::file:src/OrderList.ts';
const API_ORDERS = 'repo:shop-api/pkg:shop-api/src::file:src/orders.ts';

const repoNames = (): string[] =>
  JSON.parse(readFileSync(FILE(), 'utf8')).repos.map((r: { name: string }) => r.name);

async function queuePicks(...paths: string[]): Promise<void> {
  await browser.execute((queue: string[]) => {
    (window as unknown as { __reliefE2ePicks: string[] }).__reliefE2ePicks = queue;
  }, paths);
}

const workspaceRows = () => $$('[data-testid="workspace-repo"]');

describe('a multi-repo review, from the welcome screen to an edge between repositories', () => {
  it('creates a workspace from a repository', async () => {
    mkdirSync(SPACE());
    await setViewport(1280, 800);
    await browser.execute(() => {
      localStorage.clear();
      localStorage.setItem('lang', 'en');
    });
    await browser.execute(() => window.location.assign('/'));
    await expect(tid('welcome')).toBeDisplayed();
    await expect(tid('welcome-create-workspace')).toBeDisplayed();

    await queuePicks(join(TMP(), 'shop-web'), SPACE());
    await tid('welcome-create-workspace').click();
    await tid('repo-name').waitForDisplayed();
    await expect(tid('repo-name')).toHaveText('shop-web');
    await expect(tid('welcome')).not.toExist();
    expect(await workspaceRows()).toHaveLength(1);
    expect(repoNames()).toEqual(['shop-web']);
  });

  it('adds a second repository from the Workspace menu', async () => {
    await queuePicks(join(TMP(), 'shop-api'));
    await tid('menu-trigger-workspace').click();
    await tid('menu-item-add-repo').click();
    await browser.waitUntil(async () => (await workspaceRows()).length === 2, {
      timeoutMsg: 'the added repository never showed in the left panel',
    });
    expect(repoNames()).toEqual(['shop-web', 'shop-api']);
  });

  it('labels each repository', async () => {
    const [web, api] = await workspaceRows();
    await web.$('[data-testid="repo-labels-edit"]').click();
    await web.$('[data-testid="repo-label-option-front"]').click();
    await browser.waitUntil(async () => (await web.$$('[data-testid="repo-label"]')).length === 1);
    await api.$('[data-testid="repo-labels-edit"]').click();
    await api.$('[data-testid="repo-label-option-back"]').click();
    await browser.waitUntil(async () => (await api.$$('[data-testid="repo-label"]')).length === 1);
    const stored = JSON.parse(readFileSync(FILE(), 'utf8')).repos;
    expect(stored.map((r: { labels: string[] }) => r.labels)).toEqual([['front'], ['back']]);
  });

  it('reads the full stack change on one map: the front and the API are both modified', async () => {
    await tid('level-0').click();
    expect((await waitForNode('repo:shop-web')).tags).toEqual(['front']);
    expect((await waitForNode('repo:shop-api')).tags).toEqual(['back']);
    await tid('level-3').click();
    expect((await waitForNode(WEB_ORDER_LIST)).status).toBe('modified');
    expect((await waitForNode(API_ORDERS)).status).toBe('modified');
  });

  it('follows the edge between the two repositories', async () => {
    await tid('level-0').click();
    // The edge between the repositories did not change in this review: like any unchanged
    // edge, it shows once "Unchanged edges" is on.
    await tid('toggle-unchanged-edges').click();
    await waitForScene((s) =>
      s.edges.some((e) => e.from === 'repo:shop-web' && e.to === 'repo:shop-api'),
    );
    expect(await sceneEdge('repo:shop-web', 'repo:shop-api')).toBeDefined();
    // The camera flies to level 0: click once the boxes stand still.
    await settledNode('repo:shop-api');
    await clickEdge('repo:shop-web', 'repo:shop-api');
    await expect(tid('edge-panel')).toBeDisplayed();
  });
});
