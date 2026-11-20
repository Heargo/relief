import { browser, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { press, tid, typeText } from '../helpers/ui';

// Contract with the UI (panel controls like the mockup, U12): every visible <button> of the left
// and right panels is in a `.seg`, or is `.iconbtn` or `.tog`, or is an explicitly exempted
// clickable list row. No button keeps the native look.
const RULE_AND_EXEMPTIONS = () => {
  const exempt = (b: Element) => EXEMPT_SELECTORS.some((s) => b.matches(s));
  const visible = (b: Element) => {
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const offenders: string[] = [];
  let checked = 0;
  for (const panel of ['left-panel', 'right-panel']) {
    const root = document.querySelector(`[data-testid="${panel}"]`);
    if (!root) throw new Error(`${panel} not found`);
    for (const b of Array.from(root.querySelectorAll('button')).filter(visible)) {
      checked++;
      const ok =
        b.closest('.seg') ||
        b.classList.contains('iconbtn') ||
        b.classList.contains('tog') ||
        exempt(b);
      // The class alone is not enough: a local rule could still override it (U12 review).
      const looksLikeIconbtn =
        !b.classList.contains('iconbtn') || parseFloat(getComputedStyle(b).borderTopWidth) > 0;
      if (!ok || !looksLikeIconbtn) {
        offenders.push(
          `${panel}: <button class="${b.className}" data-testid="${b.getAttribute('data-testid')}">${(b.textContent ?? '').trim().slice(0, 30)}`,
        );
      }
    }
  }
  return { offenders, checked };
};
// Exemptions, from the real inventory on acme-shop: clickable list rows (they look like rows, not
// controls) and the Optimus `p-button` that expands the diff panel.
const EXEMPT_SELECTORS: string[] = [
  '[data-testid="entry-point-row"]',
  '[data-testid="hotspot-row"]',
  '[data-testid="rule-row"]',
  '[data-testid="signal-row"]',
  '[data-testid="quiet-row"]',
  '[data-testid="overview-row"]',
  '[data-testid="node-link"]',
  '[data-testid="node-child"]',
  '[data-testid="reading-row"]',
  '[data-testid="impact-row"]',
  '[data-testid="commit-row"]',
  '[data-testid="diff-expand"]',
];

const audit = () =>
  browser.execute(
    `const EXEMPT_SELECTORS = ${JSON.stringify(EXEMPT_SELECTORS)};
     return (${RULE_AND_EXEMPTIONS.toString()})();`,
  ) as Promise<{ offenders: string[]; checked: number }>;

describe('panel controls', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief();
  });

  it('review: no visible button of the panels keeps the native style', async () => {
    // `n` needs the reading order: wait for it, as reading-order.e2e does.
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('0/14'));
    await press('n');
    await expect(tid('selected-node')).toBeDisplayed();
    const { offenders, checked } = await audit();
    expect(checked).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });

  it('review, commit order: "Show all" and the mode switch follow the rule', async () => {
    await tid('reading-mode-commit').click();
    await press('n');
    const { offenders } = await audit();
    expect(offenders).toEqual([]);
    await expect(tid('reading-mode-commit')).toHaveAttribute('aria-pressed', 'true');
  });

  it('explore: no visible button of the panels keeps the native style', async () => {
    await tid('explore-toggle').click();
    await press('/');
    await typeText('computeTotal');
    await press('Enter');
    await expect(tid('selected-node')).toBeDisplayed();
    const { offenders, checked } = await audit();
    expect(checked).toBeGreaterThan(3);
    expect(offenders).toEqual([]);
  });
});
