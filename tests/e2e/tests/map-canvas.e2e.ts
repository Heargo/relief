import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { scene, waitForNode } from '../helpers/map-scene';

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
