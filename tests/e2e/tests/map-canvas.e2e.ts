import { $, $$, browser, expect } from '@wdio/globals';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openRelief } from '../helpers/open-relief';
import { scene, sceneEdge, waitForNode, waitForScene } from '../helpers/map-scene';

// S20: the canvas is the only renderer of the map: no node DOM, no edge SVG, no engine switch.
const WEB = 'pkg:@acme/web';

it('draws the map in a single canvas, with no node or edge element', async () => {
  await openRelief();
  await waitForNode(WEB);
  await expect($$('[data-testid="map-canvas"] canvas')).toBeElementsArrayOfSize(1);
  await expect($$('[data-testid="map-canvas"] [data-node-id]')).toBeElementsArrayOfSize(0);
  await expect($$('[data-testid="map-node"]')).toBeElementsArrayOfSize(0);
  await expect($$('[data-testid="map-edge"]')).toBeElementsArrayOfSize(0);
});

it('the canvas has painted something', async () => {
  await openRelief();
  await waitForNode(WEB);
  const painted = await browser.execute(() => {
    const c = document.querySelector('[data-testid="map-canvas"] canvas') as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  });
  expect(painted).toBe(true);
});

it('?renderer=dom has no effect: the map is still a canvas', async () => {
  await openRelief({ query: '?renderer=dom' });
  await waitForNode(WEB);
  await expect($$('[data-testid="map-canvas"] canvas')).toBeElementsArrayOfSize(1);
  await expect($$('[data-testid="map-node"]')).toBeElementsArrayOfSize(0);
});

it('the relief.renderer=dom preference has no effect: the map is still a canvas', async () => {
  await openRelief();
  await waitForNode(WEB);
  await browser.execute(() => {
    localStorage.setItem('relief.renderer', 'dom');
    window.location.assign('/');
  });
  await $('[data-testid="repo-name"]').waitForDisplayed();
  await waitForNode(WEB);
  await expect($$('[data-testid="map-canvas"] canvas')).toBeElementsArrayOfSize(1);
  await expect($$('[data-testid="map-node"]')).toBeElementsArrayOfSize(0);
});

// S18: the edges and their labels are painted on the canvas, from the scene.
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';
const BIG = { width: 3200, height: 2000 };

it('the PR walk-through lists its edges and visible labels in the scene', async () => {
  await openRelief({ size: BIG });
  await waitForNode(WEB);
  const found = await waitForScene((s) => s.edges.length > 0);
  expect(found.edges.length).toBeGreaterThan(0);
  const violation = (await sceneEdge(WEB, DB))!;
  expect(violation.label).toMatchObject({ text: '⚠ 2', visible: true });
  expect((await sceneEdge(WEB, API))!.label.text).toBe('3 +1');
});

it('paints the edges on the canvas, not as SVG', async () => {
  await openRelief({ size: BIG });
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
