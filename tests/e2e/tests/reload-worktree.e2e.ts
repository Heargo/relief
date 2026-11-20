import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { press, tid, typeText } from '../helpers/ui';

// Contract with the UI, on the range `WORKTREE` (HEAD against the working tree, opened with
// `?range=WORKTREE`): the top bar has a `reload-button` ("Reload"); clicking it asks the core again
// for the snapshot and the diff, so a symbol added to a file since the page was opened is found by
// the search ("/") afterwards. acme-shop is shared by the whole suite: the file is restored.

const FILE = 'apps/api/auth/session.ts';
const NEW_SYMBOL = 'brandNewReloadProbe';

function repoFile(): string {
  const repo = process.env['RELIEF_E2E_REPO'];
  if (!repo) throw new Error('RELIEF_E2E_REPO is not set (see wdio.base.ts)');
  return join(repo, FILE);
}

async function searchFinds(name: string): Promise<boolean> {
  await press('/');
  await typeText(name);
  await browser.pause(500);
  const found = await browser.execute(
    (text: string) =>
      (document.querySelector('[data-testid="search-results"]')?.textContent ?? '').includes(text),
    name,
  );
  await press('Escape');
  return found;
}

describe('reload when the working tree changes', () => {
  let original = '';

  beforeEach(async () => {
    clearReviewState();
    original = readFileSync(repoFile(), 'utf8');
    await openRelief({ query: '?range=WORKTREE' });
  });

  afterEach(() => {
    writeFileSync(repoFile(), original);
    clearReviewState();
  });

  it('the Reload button shows a symbol added to a file since the page was opened', async () => {
    expect(await searchFinds(NEW_SYMBOL)).toBe(false);
    appendFileSync(repoFile(), `\nexport function ${NEW_SYMBOL}(): number {\n  return 1;\n}\n`);
    await expect(tid('reload-button')).toBeDisplayed();
    await tid('reload-button').click();
    await browser.waitUntil(async () => searchFinds(NEW_SYMBOL), {
      timeout: 15000,
      interval: 1000,
      timeoutMsg: `${NEW_SYMBOL} never appeared after reloading`,
    });
  });
});
