import { $, expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { sceneNode, sceneNodes, settledNodeCount, waitForScene } from '../helpers/map-scene';
import { poll, tid, tids } from '../helpers/ui';

// Contract with the UI, on acme-shop main...feat/promo-codes (French UI):
//  - the top bar has two modes: `review-toggle` ("Relire la PR") and `explore-toggle`
//    ("Explorer le repo"), the pressed one has `aria-pressed="true"`; the PR review is the
//    default;
//  - in exploration the map is the head snapshot without diff: no `data-diff-status`, no former
//    place, and legacyCoupon.ts (deleted by the PR) is gone;
//  - the left bar has `entry-points-section` ("Points d'entrée"), only in exploration, with one
//    `entry-point-row` per entry point, carrying `data-node-id` and `data-entry-type`
//    (route | page | job).
const LEGACY = 'pkg:@acme/api/billing::file:apps/api/billing/legacyCoupon.ts';
const JOB = 'pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscriptions';

const legacyStatus = async () => (await sceneNode(LEGACY))?.status;

describe('explore mode', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ lang: 'fr', size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await settledNodeCount();
    // The edges come with the map, after the nodes.
    await waitForScene((s) => s.edges.length > 0, 15000);
  });

  it('the toggle hides legacyCoupon.ts (deleted by the PR) and shows the entry points section', async () => {
    expect(await legacyStatus()).toBe('removed');
    await expect(tid('entry-points-section')).not.toExist();

    await tid('explore-toggle').click();
    await expect(tid('explore-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'false');
    await waitForScene((s) => !s.nodes.some((n) => n.id === LEGACY));
    expect((await sceneNodes()).filter((n) => n.oldLocation)).toHaveLength(0);
    await expect(tid('entry-points-section')).toBeDisplayed();
    await expect(tid('entry-points-section')).toHaveText(expect.stringMatching(/points d'entrée/i));
    await expect($(`[data-testid="entry-point-row"][data-node-id="${JOB}"]`)).toBeDisplayed();
  });

  it('going back to "Relire la PR" brings the diff back and hides the section', async () => {
    await tid('explore-toggle').click();
    await expect(tid('entry-points-section')).toBeDisplayed();
    await tid('review-toggle').click();
    await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid('entry-points-section')).not.toExist();
    await waitForScene((s) => s.nodes.find((n) => n.id === LEGACY)?.status === 'removed');
  });

  it('lists the entry points of acme-shop: 3 pages and the renewSubscriptions job', async () => {
    await tid('explore-toggle').click();
    await tid('entry-points-section').waitForDisplayed();
    const types = async () => {
      const out: string[] = [];
      for (const row of await tids('entry-point-row')) {
        out.push(await row.getAttribute('data-entry-type'));
      }
      return out;
    };
    await poll(
      async () => (await types()).length,
      (n) => n > 0,
    );
    const all = await types();
    expect(all.filter((t) => t === 'page')).toHaveLength(3);
    expect(all.filter((t) => t === 'job')).toHaveLength(1);
  });
});
