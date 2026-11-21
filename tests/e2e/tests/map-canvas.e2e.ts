import { $, $$, browser, expect } from '@wdio/globals';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openRelief } from '../helpers/open-relief';
import { scene, sceneEdge, waitForNode, waitForScene } from '../helpers/map-scene';

// S17: with `?renderer=canvas` one <canvas> draws the map, in place of the node DOM and the edge SVG.
const WEB = 'pkg:@acme/web';

it('draws the map in a single canvas, with no node element', async () => {
  await openRelief({ query: '?renderer=canvas' });
  await waitForNode(WEB);
  await expect($$('[data-testid="map-canvas"] canvas')).toBeElementsArrayOfSize(1);
  await expect($$('[data-testid="map-canvas"] [data-node-id]')).toBeElementsArrayOfSize(0);
  await expect($$('[data-testid="map-node"]')).toBeElementsArrayOfSize(0);
});

it('the canvas has painted something', async () => {
  await openRelief({ query: '?renderer=canvas' });
  await waitForNode(WEB);
  const painted = await browser.execute(() => {
    const c = document.querySelector('[data-testid="map-canvas"] canvas') as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  });
  expect(painted).toBe(true);
  await expect($$('[data-testid="map-canvas"] [data-node-id]')).toBeElementsArrayOfSize(0);
});

it('the scene lists the same nodes as the DOM rendering', async () => {
  await openRelief();
  await waitForNode(WEB);
  const dom = (await scene()).nodes.map((n) => n.id).sort();

  await openRelief({ query: '?renderer=canvas' });
  await waitForNode(WEB);
  const canvas = (await scene()).nodes.map((n) => n.id).sort();

  expect(dom.length).toBeGreaterThan(0);
  await expect($$('[data-testid="map-canvas"] [data-node-id]')).toBeElementsArrayOfSize(0);
  expect(canvas).toEqual(dom);
});

it('the relief.renderer preference picks the canvas without the query', async () => {
  await openRelief();
  await waitForNode(WEB);
  await browser.execute(() => {
    localStorage.setItem('relief.renderer', 'canvas');
    window.location.assign('/');
  });
  await $('[data-testid="repo-name"]').waitForDisplayed();
  await browser.pause(1500);
  await expect($$('[data-testid="map-canvas"] canvas')).toBeElementsArrayOfSize(1);
  await expect($$('[data-testid="map-node"]')).toBeElementsArrayOfSize(0);
});

// S18: the edges and their labels are painted on the canvas, from the same scene as the DOM.
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';
const BIG = { width: 3200, height: 2000 };

/** The edges of the scene, as the part of them that does not depend on the renderer. */
async function edgeSummary() {
  const found = await waitForScene((s) => s.edges.length > 0);
  return found.edges
    .map(
      (e) =>
        `${e.from}>${e.to}|${e.status}|${e.merged}|${e.coChange}|${e.label.text}|${e.label.visible}`,
    )
    .sort();
}

it('the PR walk-through lists the same edges and visible labels as the DOM rendering', async () => {
  await openRelief({ size: BIG });
  await waitForNode(WEB);
  const dom = await edgeSummary();

  await openRelief({ query: '?renderer=canvas', size: BIG });
  await waitForNode(WEB);
  const canvas = await edgeSummary();

  expect(dom.length).toBeGreaterThan(0);
  expect(canvas).toEqual(dom);
  const violation = (await sceneEdge(WEB, DB))!;
  expect(violation.label).toMatchObject({ text: '⚠ 2', visible: true });
  expect((await sceneEdge(WEB, API))!.label.text).toBe('3 +1');
});

it('paints the edges on the canvas, not as SVG', async () => {
  await openRelief({ query: '?renderer=canvas', size: BIG });
  await waitForNode(WEB);
  await waitForScene((s) => s.edges.length > 0);
  await expect($$('[data-testid="map-canvas"] [data-testid="map-edge"]')).toBeElementsArrayOfSize(
    0,
  );
  // The middle of the web -> db edge is drawn: some pixel around it is painted.
  const mid = (await sceneEdge(WEB, DB))!.mid;
  const painted = await browser.execute(
    (x: number, y: number) => {
      const c = document.querySelector('[data-testid="map-canvas"] canvas') as HTMLCanvasElement;
      const box = c.getBoundingClientRect();
      const r = c.width / box.width;
      const px = Math.round((x - box.left) * r);
      const py = Math.round((y - box.top) * r);
      const size = Math.round(24 * r);
      const data = c.getContext('2d')!.getImageData(px - size, py - size, 2 * size, 2 * size).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    },
    mid.x,
    mid.y,
  );
  expect(painted).toBe(true);
});

it('the edge painter of the spike no longer exists', () => {
  const dir = join(process.cwd(), '../../src/ui/src/app/modules/map/components/map-canvas');
  expect(existsSync(join(dir, 'map-edges-temp.ts'))).toBe(false);
});
