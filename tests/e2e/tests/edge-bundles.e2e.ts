import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import {
  hoverEdge,
  sceneBundles,
  sceneNodes,
  sceneEdge,
  waitForScene,
  type SceneBundle,
} from '../helpers/map-scene';
import { clearReviewState } from '../helpers/review-state';
import { poll, tid, tids } from '../helpers/ui';

// U31, on acme-shop (main...feat/promo-codes), files level (`level-2`). Contract with the UI:
//  - 3+ edges into the same box by the same side make a bundle in `scene.bundles` (id
//    `<end>:<box>:<side>`, count, edges, mid in client coordinates); their scene edges carry
//    `bundle: <id>`;
//  - a click at the middle of the trunk (`mid`) selects the bundle: the right panel shows
//    `bundle-panel` with one `bundle-edge` row per edge of the bundle;
//  - hovering an edge of the bundle (at its own `mid`, on its branch) sets `hovered: true` on that
//    edge only.
const read = async (): Promise<SceneBundle | undefined> =>
  (await sceneBundles()).find((b) => b.count >= 3);

// Right after a level change the scene is transient (a package-level bundle may show and go):
// the bundle is taken once two reads, 300 ms apart, give the same id and the same `mid`.
const firstBundle = async (): Promise<SceneBundle> => {
  let previous = '';
  let found: SceneBundle | undefined;
  await browser.waitUntil(
    async () => {
      found = await read();
      const key = found ? `${found.id}|${found.mid.x}|${found.mid.y}` : '';
      const stable = key !== '' && key === previous;
      previous = key;
      if (!stable) await browser.pause(300);
      return stable;
    },
    { timeout: 20000, interval: 0, timeoutMsg: 'no stable bundle of 3 edges or more' },
  );
  const bundle = found as SceneBundle;
  const height = (await browser.getWindowSize()).height;
  if (bundle.mid.y < 0 || bundle.mid.y > height)
    throw new Error(`the trunk of ${bundle.id} is off screen (y=${bundle.mid.y} of ${height})`);
  return bundle;
};

// The scene gives the middle of the trunk, not its ends. The trunk runs 40 world units straight out
// of the port (the middle of the box side), so `mid` is its middle: the ends are the port and its
// mirror about `mid`. A closed box wins over a trunk that covers it, so the click goes on a point
// of the trunk that lies in no closed box of the scene.
const freeTrunkPoint = async (bundle: SceneBundle): Promise<{ x: number; y: number }> => {
  const nodes = await sceneNodes();
  const own = nodes.find((n) => n.id === bundle.box);
  if (!own) throw new Error(`the box of ${bundle.id} is not in the scene`);
  const { mid, side } = bundle;
  const port =
    side === 'top'
      ? { x: mid.x, y: own.top }
      : side === 'bottom'
        ? { x: mid.x, y: own.top + own.height }
        : side === 'left'
          ? { x: own.left, y: mid.y }
          : { x: own.left + own.width, y: mid.y };
  const outer = { x: 2 * mid.x - port.x, y: 2 * mid.y - port.y };
  const closed = nodes.filter((n) => n.mode === 'box');
  const inside = (p: { x: number; y: number }) =>
    closed.some(
      (n) => p.x >= n.left && p.x <= n.left + n.width && p.y >= n.top && p.y <= n.top + n.height,
    );
  // from the middle outwards, away from the port, then back towards it
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
    const point = {
      x: Math.round(port.x + (outer.x - port.x) * t),
      y: Math.round(port.y + (outer.y - port.y) * t),
    };
    if (!inside(point)) return point;
  }
  throw new Error(`no point of the trunk of ${bundle.id} is free of closed boxes`);
};

describe('edge bundles', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({ size: { width: 3200, height: 2000 } });
    await tid('level-2').click();
    await waitForScene((s) => s.bundles.some((b) => b.count >= 3), 20000);
  });

  it('exposes the edges into a box as a bundle', async () => {
    const bundle = await firstBundle();
    expect(bundle.id).toBe(`${bundle.end}:${bundle.box}:${bundle.side}`);
    expect(bundle.edges).toHaveLength(bundle.count);
    for (const { from, to } of bundle.edges) {
      const edge = await sceneEdge(from, to);
      expect(edge?.bundle).toBe(bundle.id);
    }
  });

  it('opens the inspector with the edges of the bundle when its trunk is clicked', async () => {
    const bundle = await firstBundle();
    const { x, y } = await freeTrunkPoint(bundle);
    await browser.action('pointer').move({ x, y }).down().up().perform();
    await expect(tid('bundle-panel')).toBeDisplayed();
    await poll(
      async () => (await tids('bundle-edge')).length,
      (n) => n === bundle.count,
    );
    await poll(
      async () => (await sceneBundles()).find((b) => b.id === bundle.id)?.selected,
      (selected) => selected === true,
    );
  });

  it('draws alone the edge of the bundle that is hovered', async () => {
    const bundle = await firstBundle();
    const { from, to } = bundle.edges[0];
    await hoverEdge(from, to);
    const scene = await waitForScene((s) => s.edges.some((e) => e.hovered));
    expect(scene.edges.filter((e) => e.hovered).map((e) => `${e.from}>${e.to}`)).toEqual([
      `${from}>${to}`,
    ]);
  });
});
