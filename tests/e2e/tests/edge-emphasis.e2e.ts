import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickEdge, clickNode, sceneEdge, sceneEdges, waitForScene } from '../helpers/map-scene';
import { press, tid } from '../helpers/ui';

// Contract with the UI, on acme-shop (main...feat/promo-codes), level 0, no impact layer, read from
// the map scene (`emphasis` of each aggregated edge):
//  - with a node selected, each edge is `out` (starts at the node), `in` (ends at it) or `dim` (all
//    the others); without selection `normal`;
//  - with an edge selected, it is `picked`, the others `dim`;
//  - Escape clears the selection and everything is back to normal.
const WEB = 'pkg:@acme/web';
const API = 'pkg:@acme/api';
const DB = 'pkg:@acme/db';

const emphasisOf = async (from: string, to: string) => (await sceneEdge(from, to))?.emphasis;

describe('selected node edges', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 }, unchangedEdges: true });
    await waitForScene(
      (s) =>
        [
          [WEB, API],
          [API, DB],
          [WEB, DB],
        ].every(([f, t]) => s.edges.some((e) => e.from === f && e.to === t)),
      15000,
    );
  });

  it('out / in edges stand out, the others dim, Escape restores', async () => {
    expect(await emphasisOf(WEB, DB)).not.toBe('dim');

    await clickNode(API);
    await waitForScene((s) => s.edges.some((e) => e.emphasis === 'out'));
    await browser.waitUntil(async () => (await emphasisOf(WEB, DB)) === 'dim', {
      timeout: 5000,
      timeoutMsg: 'dim edge never got the dim emphasis',
    });
    expect(await emphasisOf(API, DB)).toBe('out');
    expect(await emphasisOf(WEB, API)).toBe('in');
    expect(await emphasisOf(WEB, DB)).toBe('dim');

    await press('Escape');
    await waitForScene((s) => s.edges.every((e) => e.emphasis !== 'dim'), 5000);
    const after = await emphasisOf(API, DB);
    expect(after).not.toBe('out');
    expect(after).not.toBe('in');
  });

  it('a selected edge is the only one to stay sharp', async () => {
    await clickEdge(API, DB);
    await expect(tid('edge-panel')).toBeDisplayed();
    expect(await emphasisOf(API, DB)).toBe('picked');
    expect(await emphasisOf(WEB, API)).toBe('dim');
    expect((await sceneEdges()).filter((e) => e.emphasis === 'picked')).toHaveLength(1);
  });
});
