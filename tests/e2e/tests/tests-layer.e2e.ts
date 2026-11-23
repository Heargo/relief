import { $, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickNode, sceneEdges, sceneNode, waitForNode, waitForScene } from '../helpers/map-scene';
import { press, tid } from '../helpers/ui';

// R17, on acme-shop (main...feat/promo-codes), files level (2), read from the map scene. The
// fixture has test files (`*.spec.ts` next to the code) that import the code they test, e.g.
// `payment.spec.ts` imports `payment.ts`. The unchanged edges are switched on (they are off by
// default in review, R16) so that these edges exist at all.
//  - the "Tests" layer (`toggle-test-edges`, `aria-checked`) is collapsed (false) by default: no
//    scene edge starts at a test file, the test boxes stay on the map, and the tested file carries
//    a badge: `testedBy: { count, added }` on its scene node, a `tested-by-badge` button
//    (`data-node` = the node id) on the page;
//  - clicking the badge draws the test edges of that file; so does selecting a test file;
//  - switching the layer on draws everything, with no badge.
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';
const PAYMENT_SPEC = 'pkg:@acme/api/billing::file:apps/api/billing/payment.spec.ts';

const fromTest = (e: { from: string }) => /\.(spec|test|e2e)\.[a-z]+/.test(e.from);
const badge = (id: string) => $(`[data-testid="tested-by-badge"][data-node="${id}"]`);

describe('tests layer', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 }, unchangedEdges: true });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await waitForScene((s) => s.edges.length > 0, 15000);
    await waitForNode(PAYMENT_SPEC, 15000);
    await waitForScene(
      (s) => s.nodes.some((n) => n.id === PAYMENT && n.testedBy !== undefined),
      15000,
    );
  });

  it('is collapsed by default: no edge from a test, a badge on the tested file', async () => {
    await expect(tid('toggle-test-edges')).toHaveAttribute('aria-checked', 'false');
    expect((await sceneEdges()).filter(fromTest)).toHaveLength(0);
    expect(await sceneNode(PAYMENT_SPEC)).toBeDefined();
    expect((await sceneNode(PAYMENT))?.testedBy).toEqual({ count: 1, added: 0 });
    await expect(badge(PAYMENT)).toBeDisplayed();
  });

  it('draws the test edges of a file when its badge is clicked', async () => {
    await badge(PAYMENT).click();
    await waitForScene(
      (s) => s.edges.some((e) => e.from === PAYMENT_SPEC && e.to === PAYMENT),
      8000,
    );
    await expect(tid('toggle-test-edges')).toHaveAttribute('aria-checked', 'false');
  });

  it('draws the edges of a selected test file', async () => {
    await clickNode(PAYMENT_SPEC);
    await waitForScene((s) => s.edges.some((e) => e.from === PAYMENT_SPEC), 8000);
    await press('Escape');
    await waitForScene((s) => s.edges.every((e) => !fromTest(e)), 8000);
  });

  it('draws everything once the layer is switched on', async () => {
    await tid('toggle-test-edges').click();
    await expect(tid('toggle-test-edges')).toHaveAttribute('aria-checked', 'true');
    await waitForScene((s) => s.edges.some(fromTest), 8000);
    expect((await sceneNode(PAYMENT))?.testedBy ?? null).toBeNull();
    await expect(badge(PAYMENT)).not.toBeExisting();
  });
});
