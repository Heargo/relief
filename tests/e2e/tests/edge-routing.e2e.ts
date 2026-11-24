import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneEdges, waitForScene, type SceneNode } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// U32, on acme-shop (main...feat/promo-codes), Files level (`level-2`), read from the map scene:
//  - the edges that are drawn alone expose `route`, the points (client coordinates) of their
//    route along the corridors; the edges of a bundle and the edges that fell back on the direct
//    curve have `route: null`;
//  - no route crosses a box that is neither its source, nor its target, nor one of their ancestors
//    (an id is within another when it starts with `<other>::` or `<other>/`).
const within = (id: string, box: string): boolean =>
  id === box || id.startsWith(`${box}::`) || id.startsWith(`${box}/`);

// A route may touch a box (its ends sit on borders, its corridors run along them): only a
// penetration of more than a pixel counts as a crossing.
const EPS = 1;

function crosses(route: { x: number; y: number }[], n: SceneNode): boolean {
  for (let i = 0; i + 1 < route.length; i++) {
    const [a, b] = [route[i], route[i + 1]];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (
      x1 > n.left + EPS &&
      x0 < n.left + n.width - EPS &&
      y1 > n.top + EPS &&
      y0 < n.top + n.height - EPS
    )
      return true;
  }
  return false;
}

describe('edge routing', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 }, unchangedEdges: true });
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await waitForScene((s) => s.edges.some((e) => e.route !== null && e.route.length >= 2), 20000);
  });

  it('exposes the points of the routes of the edges', async () => {
    const routed = (await sceneEdges()).filter((e) => e.route !== null);
    expect(routed.length).toBeGreaterThan(0);
    for (const e of routed) {
      const route = e.route!;
      expect(route.length).toBeGreaterThanOrEqual(2);
      route.forEach((p, i) => {
        if (i === 0) return;
        const q = route[i - 1];
        // horizontal or vertical segments (sub-pixel rounding tolerated)
        expect(Math.min(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBeLessThan(1);
      });
    }
  });

  it('leaves the edges of a bundle on their branches', async () => {
    const bundled = (await sceneEdges()).filter((e) => e.bundle !== null);
    expect(bundled.every((e) => e.route === null)).toBe(true);
  });

  it('crosses no box that is not its source, its target or an ancestor of them', async () => {
    // the scene is transient right after a level change: read nodes and edges together
    const scene = await waitForScene((s) => s.edges.some((e) => e.route !== null), 20000);
    const nodes = scene.nodes.filter((n) => n.mode !== 'ghost');
    let checked = 0;
    for (const e of scene.edges) {
      if (!e.route) continue;
      checked++;
      for (const n of nodes) {
        if (within(e.from, n.id) || within(e.to, n.id)) continue;
        if (crosses(e.route, n)) throw new Error(`${e.from} -> ${e.to} crosses ${n.id}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
