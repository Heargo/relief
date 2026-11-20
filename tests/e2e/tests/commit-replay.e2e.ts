import { $, browser, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { poll, press, tid, tids } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency), on main...feat/promo-codes:
//  - the reading order has a third mode button `reading-mode-commit`; in that mode the rows are
//    `commit-row` (one per commit of the range, oldest first) carrying `data-commit` (full sha),
//    `data-seen-count` and `data-total-count` (the "x/y seen"), whose text holds the short sha and
//    the message; the files of a commit are `reading-row` elements inside it;
//  - clicking a `commit-row` filters the map: only the nodes touched by that commit keep a
//    `data-diff-status` other than `unchanged` (absent counts as unchanged); the row gets
//    `data-selected="true"`;
//  - `commit-show-all` ("see all the commits") removes the filter; clicking the selected row again
//    does too; `n` / `p` move the selection from commit to commit while in commit mode.
const SESSION = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts';
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';
const AUTH_MESSAGE = 'refactor(auth): refresh() renvoie null';

async function coloured(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('[data-testid="map-node"]'))
      .filter((el) => {
        const status = el.getAttribute('data-diff-status');
        return status !== null && status !== 'unchanged';
      })
      .map((el) => el.getAttribute('data-node-id') as string)
      .filter((id) => id.includes('::file:') && !id.includes('::sym:'))
      .sort(),
  );
}

/** Waits until the coloured files stop changing (the camera animation settles), then returns them. */
async function settled(): Promise<string[]> {
  let previous: string[] = [];
  await browser.waitUntil(
    async () => {
      const now = await coloured();
      const same = now.length > 0 && JSON.stringify(now) === JSON.stringify(previous);
      previous = now;
      return same;
    },
    { timeout: 8000, interval: 600, timeoutMsg: 'the map never settled' },
  );
  return previous;
}

async function nodeBox(id: string): Promise<string> {
  return browser.execute(
    (nodeId: string) =>
      JSON.stringify(
        document
          .querySelector(`[data-testid="map-node"][data-node-id="${nodeId}"]`)
          ?.getBoundingClientRect(),
      ),
    id,
  );
}

async function authRow() {
  for (const row of await tids('commit-row')) {
    if ((await row.getText()).includes(AUTH_MESSAGE)) return row;
  }
  throw new Error('commit row of the auth commit not found');
}

describe('reading order by commit and replay on the map', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await $('[data-testid="reading-mode-commit"]').click();
  });

  it('lists the five commits of the range with their sha and message', async () => {
    await poll(
      async () => (await tids('commit-row')).length,
      (n) => n === 5,
    );
    const first = await tids('commit-row')[0];
    await expect(first).toHaveText(expect.stringContaining('feat(db): table discounts et repo'));
    const auth = await authRow();
    const sha = await auth.getAttribute('data-commit');
    await expect(auth).toHaveText(expect.stringContaining(sha.slice(0, 7)));
    await expect(auth).toHaveAttribute('data-total-count', '2');
    await expect(auth).toHaveAttribute('data-seen-count', '0');
  });

  it('clicking the auth commit colours only session.ts and payment.ts and frames them; "see all" restores everything', async () => {
    const all = await settled();
    expect(all.length).toBeGreaterThan(2);
    const before = await nodeBox(SESSION);

    await (await authRow()).click();
    expect(await settled()).toEqual([SESSION, PAYMENT].sort());
    expect(await nodeBox(SESSION)).not.toEqual(before);

    await tid('commit-show-all').click();
    expect(await settled()).toEqual(all);
  });

  it('clicking the selected commit again removes the filter', async () => {
    const all = await settled();
    await (await authRow()).click();
    expect(await settled()).toHaveLength(2);
    await (await authRow()).click();
    expect(await settled()).toEqual(all);
  });

  it('n and p move from commit to commit', async () => {
    await press('n');
    await expect((await tids('commit-row'))[0]).toHaveAttribute('data-selected', 'true');
    await press('n');
    await expect((await tids('commit-row'))[1]).toHaveAttribute('data-selected', 'true');
    await press('p');
    await expect((await tids('commit-row'))[0]).toHaveAttribute('data-selected', 'true');
  });

  it('seen by commit reuses the progress of the range', async () => {
    await (await authRow()).click();
    const [file] = await tids('reading-row');
    await file.click();
    await press('v');
    await expect(await authRow()).toHaveAttribute('data-seen-count', '1');
  });
});
