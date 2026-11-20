import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { forceClick, tid, tids } from '../helpers/ui';

// Contract with the UI (ticket U20), on acme-shop (main...feat/promo-codes): the panel of an edge
// has a section `edge-usages` with, per source file, `usage-file`, per imported symbol
// `usage-group` (`data-binding`), per usage `usage-row` (`data-line`, text of the code line in
// `usage-snippet`). A click on a row opens the source file in the node panel with the line
// `code-line[data-line]` marked `data-focused="true"`.
const API = 'pkg:@acme/api';
const DB = 'pkg:@acme/db';
const API_DB = `[data-testid="map-edge"][data-from="${API}"][data-to="${DB}"]`;

describe('the usages of an edge', () => {
  it('clicking an edge lists the usages, and clicking one opens the code at its line', async () => {
    await openRelief({ size: { width: 3200, height: 2000 } });
    await $(API_DB).waitForExist();

    await forceClick(API_DB);
    await expect(tid('edge-panel')).toBeDisplayed();
    await browser.waitUntil(async () => (await tids('usage-row').length) > 0, {
      timeout: 15000,
      timeoutMsg: 'no usage was ever listed for the api -> db edge',
    });

    // routes/invoices.ts calls `findInvoice(req.params.id)` on line 10 of the head file.
    const row = $(
      '[data-testid="usage-file"][data-file-id*="routes/invoices.ts"] [data-testid="usage-row"][data-line="10"]',
    );
    await expect(row).toHaveText(expect.stringContaining('findInvoice(req.params.id)'));
    await expect($('[data-testid="usage-group"][data-binding="findInvoice"]')).toBeDisplayed();

    await row.click();
    await expect(tid('selected-node')).toHaveAttribute(
      'data-node-id',
      expect.stringContaining('apps/api/routes/invoices.ts'),
    );
    const line = $('[data-testid="code-line"][data-line="10"][data-focused="true"]');
    await line.waitForExist({ timeout: 10000 });
    await expect(line).toHaveText(expect.stringContaining('findInvoice(req.params.id)'));
    expect(await $$('[data-testid="code-line"][data-focused="true"]').length).toBe(1);
  });
});
