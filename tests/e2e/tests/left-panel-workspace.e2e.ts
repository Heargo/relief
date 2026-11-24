import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (ticket K04), on acme-shop main...feat/promo-codes:
//  - `workspace-header` is the first block of `left-panel`: `repo-name` and `ref` (current
//    branch), above the mode switch;
//  - `compare-section` sits under the mode switch, in review mode only, and holds the range
//    controls (`compare-destination`, `compare-source`, ...), which are no longer in the top bar.

const inside = (parent: string, child: string) =>
  browser.execute(
    (p: string, c: string) => {
      const root = document.querySelector(p);
      return !!root && !!root.querySelector(c);
    },
    parent,
    child,
  );

it('heads the left panel with the repository name and the branch', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('workspace-header')).toBeDisplayed();
  expect(
    await inside('[data-testid="left-panel"] > :first-child', '[data-testid="repo-name"]'),
  ).toBe(true);
  expect(await inside('[data-testid="workspace-header"]', '[data-testid="ref"]')).toBe(true);
  expect(await inside('header.topbar', '[data-testid="repo-name"]')).toBe(false);
  await expect(tid('repo-name')).toHaveText('acme-shop');
  await expect(tid('ref')).toHaveText(expect.stringContaining('feat/promo-codes'));
  const above = await browser.execute(() => {
    const h = document.querySelector('[data-testid="workspace-header"]')!;
    const t = document.querySelector('[data-testid="review-toggle"]')!;
    return !!(h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(above).toBe(true);
});

it('shows the comparison under the mode switch in review mode, out of the top bar', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('compare-section')).toBeDisplayed();
  expect(
    await inside('[data-testid="compare-section"]', '[data-testid="compare-destination"]'),
  ).toBe(true);
  expect(await inside('[data-testid="compare-section"]', '[data-testid="compare-source"]')).toBe(
    true,
  );
  expect(await inside('header.topbar', '[data-testid="compare-destination"]')).toBe(false);
  const below = await browser.execute(() => {
    const t = document.querySelector('[data-testid="review-toggle"]')!;
    const c = document.querySelector('[data-testid="compare-section"]')!;
    return !!(t.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(below).toBe(true);
});

it('hides the comparison in explore mode, keeps the header, and restores it in review mode', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('explore-toggle').click();
  await expect(tid('hotspots-section')).toBeDisplayed();
  await expect(tid('compare-section')).not.toBeExisting();
  await expect(tid('compare-destination')).not.toBeExisting();
  await expect(tid('workspace-header')).toBeDisplayed();
  await expect(tid('repo-name')).toHaveText('acme-shop');
  await tid('review-toggle').click();
  await expect(tid('compare-section')).toBeDisplayed();
  await expect(tid('compare-destination')).toBeDisplayed();
});
