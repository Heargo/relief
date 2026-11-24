// @workspace shop-space
import { $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickNode, settledNode } from '../helpers/map-scene';
import { press, tid, typeText } from '../helpers/ui';

// Ticket K16, on the workspace `tests/fixtures/shop-space` (web: branch feat/order-badge, api:
// branch feat/order-total, both compared with main): the use cases that read one repository work
// on a prefixed id.
//  - a click on a file box shows its code in the panel (`node-code`), not "code unavailable";
//  - the diff panel of a modified symbol shows its text diff, on the range of its own repository;
//  - the search finds a symbol of the other repository.
const SIZE = { width: 1600, height: 1000 };
const WEB_MAIN = 'repo:web/pkg:shop-web/src::file:src/main.ts';

const line = (kind: string, text: string) =>
  `//*[@data-testid="diff-panel"]//*[@data-testid="diff-line"][@data-kind="${kind}"][contains(., "${text}")]`;

async function search(name: string, idEnd: RegExp): Promise<void> {
  await press('/');
  await typeText(name);
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', expect.stringMatching(idEnd));
}

it('shows the code of a file clicked on the map', async () => {
  await openRelief({ size: SIZE });
  await tid('level-3').click();
  await settledNode(WEB_MAIN);
  await clickNode(WEB_MAIN);
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', WEB_MAIN);
  await expect(tid('node-code')).toHaveText(
    expect.stringContaining('import { loadOrders, renderOrders } from "./OrderList";'),
  );
});

it('shows the text diff of a modified symbol, on the range of its repository', async () => {
  await openRelief({ size: SIZE });
  await search('renderOrders', /^repo:web\/.*sym:renderOrders$/);
  await expect(tid('diff-panel')).toBeDisplayed();
  await expect($$(line('added', 'orders.length'))).toBeElementsArrayOfSize(1);
  await expect($$(line('removed', 'return orders.map'))).toBeElementsArrayOfSize(1);
  await expect(tid('node-code')).toHaveText(expect.stringContaining('orders.length'));
});

it('finds a symbol of the other repository and shows its code', async () => {
  await openRelief({ size: SIZE });
  await search('createOrder', /^repo:api\/.*sym:createOrder$/);
  await expect(tid('node-code')).toHaveText(expect.stringContaining('lines.reduce'));
  await expect($$(line('removed', 'total: 0'))).toBeElementsArrayOfSize(1);
});
