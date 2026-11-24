import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import {
  doubleClickNode,
  sceneNode,
  sceneNodeByLabel,
  sceneNodes,
  waitForNode,
  waitForScene,
} from '../helpers/map-scene';
import { poll, press, rectOf, tid, toggleLayer } from '../helpers/ui';

// Contract with the UI: the map is read through `window.__reliefScene()` (helpers/map-scene.ts),
// not through its DOM:
//  - the canvas is `data-testid="map-canvas"`;
//  - the current level is `data-testid="current-level"` with `data-level="0..3"`;
//  - level buttons are `data-testid="level-0"` .. `level-3`.
const isSystem = (n: { kind: string }) => n.kind === 'service' || n.kind === 'package';
const sessionDrawn = async () =>
  (await sceneNodes()).some(
    (n) => n.kind === 'file' && n.mode !== 'ghost' && n.label === 'session.ts',
  );

it('level 0 shows the four systems and the external dependencies', async () => {
  await openRelief();
  await expect(tid('map-canvas')).toBeDisplayed();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  await waitForScene((sc) => sc.nodes.filter(isSystem).length === 4);
  // the external dependencies are hidden by default (U13)
  await toggleLayer('toggle-hide-external');
  await waitForNode('pkg:external');
  // nothing deeper is drawn at this level
  expect(await sessionDrawn()).toBe(false);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
]) {
  it(`key 2 opens the files level and shows session.ts at ${viewport.width}x${viewport.height}`, async () => {
    await openRelief({ size: viewport });
    await waitForScene((sc) => sc.nodes.filter(isSystem).length === 4);
    await press('2');
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await waitForScene((sc) => sc.nodes.some((n) => n.label === 'session.ts'));
    expect((await sceneNodeByLabel('session.ts'))?.kind).toBe('file');
  });
}

it('apps/api is a box that contains the auth/ module', async () => {
  await openRelief();
  // Level 2 (Modules): containment is geometric.
  await tid('level-2').click();
  await expect(tid('current-level')).toHaveAttribute('data-level', '2');
  const outer = await waitForNode('pkg:@acme/api');
  const inner = await waitForNode('pkg:@acme/api/auth');
  expect(outer.label).toBe('apps/api');
  expect(inner.label).toContain('auth/');
  expect(inner.left).toBeGreaterThanOrEqual(outer.left);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top);
  expect(inner.left + inner.width).toBeLessThanOrEqual(outer.left + outer.width);
  expect(inner.top + inner.height).toBeLessThanOrEqual(outer.top + outer.height);
});

it('the level buttons change the level too', async () => {
  await openRelief();
  await tid('level-1').click();
  await expect(tid('current-level')).toHaveAttribute('data-level', '1');
  await tid('level-0').click();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
});

it('double-clicking apps/api frames that system', async () => {
  await openRelief();
  const api = 'pkg:@acme/api';
  // `openRelief` only waits for the top bar: the map exists once a node is drawn.
  const before = await waitForNode(api);
  const canvas = await rectOf('map-canvas');

  await doubleClickNode(api);

  await poll(
    async () => (await sceneNode(api))?.width ?? 0,
    (w) => w > before.width * 1.3,
  );
  await browser.pause(700); // end of the framing animation
  const after = (await sceneNode(api))!;
  expect(after.left).toBeGreaterThanOrEqual(canvas.x - 1);
  expect(after.top).toBeGreaterThanOrEqual(canvas.y - 1);
  expect(after.left + after.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(after.top + after.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  expect(after.left + after.width / 2).toBeCloseTo(canvas.x + canvas.width / 2, -1);
  expect(Number(await tid('current-level').getAttribute('data-level'))).toBeGreaterThanOrEqual(1);
});

// Indicative only: it records slow frames in the log and never fails on them.
// No frame timing under Xvfb: requestAnimationFrame yields 0 or 1 frame, the measure means nothing.
it.skip('zooming stays fluid (indicative, non blocking)', async () => {
  await openRelief();
  const canvas = await rectOf('map-canvas');
  await browser.execute(() => {
    const w = window as unknown as { frames: number[] };
    w.frames = [];
    let last = performance.now();
    const tick = (now: number) => {
      w.frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const x = Math.round(canvas.x + canvas.width / 2);
  const y = Math.round(canvas.y + canvas.height / 2);
  const wheel = browser.action('wheel');
  for (let i = 0; i < 20; i++) wheel.scroll({ x, y, deltaX: 0, deltaY: -120, duration: 0 });
  for (let i = 0; i < 20; i++) wheel.scroll({ x, y, deltaX: 0, deltaY: 120, duration: 0 });
  // The measure is indicative: a driver that cannot send wheel events must not fail the suite.
  await wheel
    .perform()
    .catch((error: Error) => console.log(`fluidity: wheel failed: ${error.message}`));
  const frames = await browser.execute(() => (window as unknown as { frames: number[] }).frames);
  const slow = frames.filter((f) => f > 50);
  console.log(`fluidity: ${slow.length} frame(s) > 50 ms out of ${frames.length}`);
});
