import { browser, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { sceneNodes } from '../helpers/map-scene';
import { press, tid, typeText } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency), on main...feat/promo-codes:
//  - the left panel has a `layers-section` holding the buttons `toggle-diff-layer`,
//    `toggle-unchanged-edges`, `toggle-focus-layer` and `toggle-impact-layer` (`aria-checked`);
//  - the `f` key toggles the focus layer; while it is on, every node of the map scene outside "changed symbols
//    + neighbours at one hop (+ their containers)" has `faded: true` in the scene.
// CheckoutPage is changed by the PR; LoginPage is only linked to it through useSession (2+ hops).

async function fadedState(pattern: RegExp): Promise<string> {
  const node = (await sceneNodes()).find((n) => pattern.test(n.id));
  if (!node) return 'missing';
  return node.faded ? 'faded' : 'sharp';
}

/** Frames a symbol by search (off-screen boxes are not drawn), waits for the camera, then reads it. */
async function stateOf(name: string): Promise<string> {
  await press('/');
  await typeText(name);
  await expect(tid('search-results')).toBeDisplayed();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute(
    'data-node-id',
    expect.stringMatching(new RegExp(`::sym:${name}$`)),
  );
  let previous = '';
  let state = 'missing';
  await browser.waitUntil(
    async () => {
      state = await fadedState(new RegExp(`::sym:${name}$`));
      const same = state !== 'missing' && state === previous;
      previous = state;
      return same;
    },
    { timeout: 10000, interval: 600, timeoutMsg: `${name} never settled` },
  );
  return state;
}

describe('focus layer', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ size: { width: 3200, height: 2000 } });
  });

  it('the Layers section holds the toggles', async () => {
    const section = tid('layers-section');
    await expect(section).toBeDisplayed();
    for (const id of [
      'toggle-diff-layer',
      'toggle-unchanged-edges',
      'toggle-focus-layer',
      'toggle-impact-layer',
    ]) {
      await expect(section.$(`[data-testid="${id}"]`)).toBeExisting();
    }
  });

  it('f fades LoginPage but not CheckoutPage, and f again restores', async () => {
    expect(await stateOf('LoginPage')).toBe('sharp');
    await press('Escape');
    await press('f');
    await expect(tid('toggle-focus-layer')).toHaveAttribute('aria-checked', 'true');
    expect(await stateOf('LoginPage')).toBe('faded');
    expect(await stateOf('CheckoutPage')).toBe('sharp');
    await press('Escape');
    await press('f');
    await expect(tid('toggle-focus-layer')).toHaveAttribute('aria-checked', 'false');
    expect(await stateOf('LoginPage')).toBe('sharp');
  });
});
