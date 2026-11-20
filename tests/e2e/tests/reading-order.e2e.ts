import { $, browser } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { poll, press, tid, tids } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the section is `reading-order`; its mode buttons are `reading-mode-file` / `reading-mode-symbol`;
//  - rows are `reading-row` with `data-node-id` and `data-seen="true"|"false"`;
//  - the progress is `reading-progress` ("1/14");
//  - keys: `n` next, `p` previous, `v` toggles seen on the selected entry.
const COMPUTE_TOTAL = /sym:computeTotal$/;

describe('reading order and seen', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief();
  });

  it('n selects the first file, v marks it seen, the progress is 1/14 and survives a reload', async () => {
    await expect(tid('reading-order')).toBeDisplayed();
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('0/14'));
    const first = await tids('reading-row')[0].getAttribute('data-node-id');

    await press('n');
    await expect(tid('selected-node')).toHaveAttribute('data-node-id', first);
    await press('v');
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('1/14'));

    await browser.refresh();
    await tid('repo-name').waitForDisplayed();
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('1/14'));
    await expect(tids('reading-row')[0]).toHaveAttribute('data-seen', 'true');
  });

  it('in symbol mode there are 22 entries and marking computeTotal does not mark invoice.ts', async () => {
    await $('[data-testid="reading-mode-symbol"]').click();
    await poll(
      async () => (await tids('reading-row')).length,
      (n) => n === 22,
    );

    const rows = await tids('reading-row');
    let target;
    for (const row of rows) {
      if (COMPUTE_TOTAL.test(await row.getAttribute('data-node-id'))) target = row;
    }
    await target!.click();
    await press('v');
    await expect(target!).toHaveAttribute('data-seen', 'true');
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('1/22'));

    await $('[data-testid="reading-mode-file"]').click();
    for (const row of await tids('reading-row')) {
      const id = await row.getAttribute('data-node-id');
      if (id.endsWith('apps/api/billing/invoice.ts')) {
        await expect(row).toHaveAttribute('data-seen', 'false');
      }
    }
  });

  it('a long path wraps beside its checkbox, never under it', async () => {
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('0/14'));
    const rows = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid="reading-row"]')).map((row) => {
        const check = row.querySelector('p-checkbox')?.getBoundingClientRect();
        const body = row.querySelector('.body') as HTMLElement | null;
        const text = body?.getBoundingClientRect();
        return {
          id: row.getAttribute('data-node-id'),
          lines: body ? Math.round(body.getBoundingClientRect().height / 14) : 0,
          beside: !!check && !!text && text.left >= check.right,
        };
      }),
    );
    // acme-shop has paths too long for the 300 px sidebar (PromoCodeInput.tsx, discountRepo.ts).
    expect(rows.some((r) => r.lines > 1)).toBe(true);
    expect(rows.filter((r) => !r.beside)).toEqual([]);
  });
});
