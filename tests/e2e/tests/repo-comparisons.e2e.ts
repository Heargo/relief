// @workspace shop-space
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { waitForNode } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// Ticket K10, on the workspace `tests/fixtures/shop-space` (`web` on feat/order-badge, `api` on
// feat/order-total, both into main). Under the mode toggle, `repo-comparisons-button` swaps the
// left panel for `repo-comparisons-menu`: a `repo-comparison` row per repository with
// `repo-comparison-name`, `repo-comparison-source`, `repo-comparison-destination` (each opens the
// `range-popover` of `range-option` rows) and `repo-comparison-default`, then a
// `repo-comparisons-back` button. Changing the source of `api` to main empties its diff and leaves
// `web` alone; "Set as default" writes the comparison in the workspace file, which the test puts
// back as it was (the file is shared by the specs of the run).

const SIZE = { width: 1280, height: 800 };
const FILE = () => join(process.env['RELIEF_E2E_REPO'] as string, 'shop.relief.json');
const WEB_ORDER_LIST = 'repo:web/pkg:shop-web/src::file:src/OrderList.ts';
const API_ORDERS = 'repo:api/pkg:shop-api/src::file:src/orders.ts';

let original = '';

before(() => {
  original = readFileSync(FILE(), 'utf8');
});

afterEach(() => {
  writeFileSync(FILE(), original);
});

it('changes the source of one repository from the menu, and the map follows', async () => {
  await openRelief({ size: SIZE });
  await tid('level-3').click();
  expect((await waitForNode(API_ORDERS)).status).toBe('modified');
  expect((await waitForNode(WEB_ORDER_LIST)).status).toBe('modified');

  await tid('repo-comparisons-button').click();
  await expect(tid('repo-comparisons-menu')).toExist();
  const rows = await $$('[data-testid="repo-comparison"]');
  expect(rows).toHaveLength(2);
  await expect(rows[1].$('[data-testid="repo-comparison-name"]')).toHaveText('api');
  await expect(rows[1].$('[data-testid="repo-comparison-source"]')).toHaveText('feat/order-total');

  await rows[1].$('[data-testid="repo-comparison-source"]').click();
  await $('[data-testid="range-option"]=main').click();
  await expect(rows[1].$('[data-testid="repo-comparison-source"]')).toHaveText('main');

  await tid('repo-comparisons-back').click();
  await expect(tid('repo-comparisons-menu')).not.toExist();
  await expect(tid('review-toggle')).toExist();
  await tid('level-3').click();
  await browser.waitUntil(async () => (await waitForNode(API_ORDERS)).status === 'unchanged');
  expect((await waitForNode(WEB_ORDER_LIST)).status).toBe('modified');
});

it('sets a repository comparison as its default in the workspace file', async () => {
  await openRelief({ size: SIZE });
  await tid('repo-comparisons-button').click();
  const api = (await $$('[data-testid="repo-comparison"]'))[1];
  await api.$('[data-testid="repo-comparison-source"]').click();
  await $('[data-testid="range-option"]=main').click();
  await api.$('[data-testid="repo-comparison-default"]').click();
  await browser.waitUntil(
    async () => JSON.parse(readFileSync(FILE(), 'utf8')).repos[1].source === 'main',
  );
  const written = JSON.parse(readFileSync(FILE(), 'utf8'));
  expect(written.repos[1].destination).toBe('main');
  expect(written.repos[0].source).toBe('feat/order-badge');
});
