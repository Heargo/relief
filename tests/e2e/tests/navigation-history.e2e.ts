import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { forceClick, tid } from '../helpers/ui';

// Contract with the UI (ticket U25), on acme-shop (main...feat/promo-codes): `Alt+ArrowLeft` /
// `Alt+ArrowRight` and the buttons `history-back` / `history-forward` of the breadcrumbs go to the
// previous / next step of the navigation (selection and camera); a button is `disabled` when
// there is no such step.
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const WEB_DB = `[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"]`;
const WEB_DB_ROW = `[data-testid="node-edges-depends-on"] [data-testid="node-edge-row"][data-from="${WEB}"][data-to="${DB}"]`;

const back = () => browser.keys(['Alt', 'ArrowLeft']);
const forward = () => browser.keys(['Alt', 'ArrowRight']);

// Steps: the edge web -> db, the node web, the same edge again (from the node), the node db.
async function walk() {
  await openRelief();
  await $(WEB_DB).waitForExist();
  await forceClick(WEB_DB);
  await tid('inspector-from').click();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', WEB);
  await $(WEB_DB_ROW).click();
  await expect(tid('inspector-badge')).toHaveAttribute('data-kind', 'edge');
  await tid('inspector-to').click();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', DB);
}

it('Alt+Left selects the previous node again and frames it, Alt+Right comes back', async () => {
  await walk();

  await back();
  await expect(tid('inspector-badge')).toHaveAttribute('data-kind', 'edge');
  await back();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', WEB);
  await expect($(`[data-testid="map-node"][data-node-id="${WEB}"]`)).toBeDisplayed();

  await forward();
  await expect(tid('inspector-badge')).toHaveAttribute('data-kind', 'edge');
  await forward();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', DB);
});

it('the buttons of the breadcrumbs go back and forward', async () => {
  await openRelief();
  await $(WEB_DB).waitForExist();
  await expect(tid('history-back')).toBeDisabled();
  await expect(tid('history-forward')).toBeDisabled();

  await walk();
  await expect(tid('history-back')).toBeEnabled();
  await expect(tid('history-forward')).toBeDisabled();

  await tid('history-back').click();
  await tid('history-back').click();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', WEB);
  await expect(tid('history-forward')).toBeEnabled();

  await tid('history-forward').click();
  await tid('history-forward').click();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', DB);
  await expect(tid('history-forward')).toBeDisabled();
});
