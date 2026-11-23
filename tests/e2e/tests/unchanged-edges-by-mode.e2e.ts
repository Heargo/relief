import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickNode, sceneEdges, waitForScene } from '../helpers/map-scene';
import { press, tid } from '../helpers/ui';

// R16, on acme-shop (main...feat/promo-codes), files level (2), read from the map scene:
//  - in review mode the "unchanged edges" layer (`toggle-unchanged-edges`, `aria-checked`) is off by
//    default: no scene edge has the status `unchanged`, except those of the selected node;
//  - the switch brings them back; in exploration the layer is on by default.
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';

const unchanged = async () => (await sceneEdges()).filter((e) => e.status === 'unchanged');
const touches = (id: string) => (e: { from: string; to: string }) =>
  e.from.startsWith(id) || e.to.startsWith(id);

describe('unchanged edges by mode', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await waitForScene((s) => s.edges.length > 0, 15000);
  });

  it('review: none by default, except around the selected node; the switch brings them back', async () => {
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'false');
    expect(await unchanged()).toHaveLength(0);

    await clickNode(PAYMENT);
    await waitForScene((s) => s.edges.some((e) => e.status === 'unchanged'), 8000);
    expect((await unchanged()).every(touches(PAYMENT))).toBe(true);
    await press('Escape');
    await waitForScene((s) => s.edges.every((e) => e.status !== 'unchanged'), 8000);

    await tid('toggle-unchanged-edges').click();
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'true');
    await waitForScene((s) => s.edges.some((e) => e.status === 'unchanged'), 8000);
    expect((await unchanged()).some((e) => !touches(PAYMENT)(e))).toBe(true);
  });

  it('exploration: the unchanged edges are there by default', async () => {
    await tid('explore-toggle').click();
    await expect(tid('explore-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'true');
    await waitForScene((s) => s.edges.some((e) => e.status === 'unchanged'), 8000);
  });

  it('remembers the choice of each mode apart', async () => {
    await tid('toggle-unchanged-edges').click();
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'true');
    await tid('explore-toggle').click();
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'true');
    await tid('toggle-unchanged-edges').click();
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'false');
    await tid('review-toggle').click();
    await expect(tid('toggle-unchanged-edges')).toHaveAttribute('aria-checked', 'true');
  });
});
