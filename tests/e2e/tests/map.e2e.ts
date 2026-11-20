import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { poll, press, rect, rectOf, tid } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the canvas is `data-testid="map-canvas"`;
//  - each rendered node is `data-testid="map-node"` with `data-node-id`, `data-kind` (NodeKind)
//    and `data-mode` (open | box | ghost);
//  - the current level is `data-testid="current-level"` with `data-level="0..3"`;
//  - level buttons are `data-testid="level-0"` .. `level-3`.
const SYSTEMS =
  '[data-testid="map-node"][data-kind="service"], [data-testid="map-node"][data-kind="package"]';
const SESSION = '[data-testid="map-node"][data-kind="file"]:not([data-mode="ghost"])';
const SESSION_TS =
  '//*[@data-testid="map-node"][@data-kind="file"][not(@data-mode="ghost")][contains(., "session.ts")]';

it('level 0 shows the four systems and the external dependencies', async () => {
  await openRelief();
  await expect(tid('map-canvas')).toBeDisplayed();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  await expect($$(SYSTEMS)).toBeElementsArrayOfSize(4);
  // the external dependencies are hidden by default (U13)
  await tid('toggle-hide-external').click();
  await expect($('[data-node-id="pkg:external"]')).toBeDisplayed();
  // nothing deeper is drawn at this level
  await expect($$(SESSION_TS)).toBeElementsArrayOfSize(0);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
]) {
  it(`key 2 opens the files level and shows session.ts at ${viewport.width}x${viewport.height}`, async () => {
    await openRelief({ size: viewport });
    await expect($$(SYSTEMS)).toBeElementsArrayOfSize(4);
    await press('2');
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await expect($(SESSION_TS)).toBeDisplayed();
  });
}

it('apps/api is a box that contains the auth/ module', async () => {
  await openRelief();
  // Level 2 (Modules): the canvas renders nodes flat, so containment is geometric, not DOM.
  await tid('level-2').click();
  await expect(tid('current-level')).toHaveAttribute('data-level', '2');
  const api = $('[data-node-id="pkg:@acme/api"]');
  const auth = $('[data-node-id="pkg:@acme/api/auth"]');
  await expect(api).toBeDisplayed();
  // textContent: the label is clipped by the box, so its rendered text is empty for WebDriver.
  await expect(api.$('.lb')).toHaveElementProperty('textContent', 'apps/api');
  await expect(auth).toBeDisplayed();
  await expect(auth).toHaveElementProperty('textContent', expect.stringContaining('auth/'));
  const outer = await rect('[data-node-id="pkg:@acme/api"]');
  const inner = await rect('[data-node-id="pkg:@acme/api/auth"]');
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
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
  const apiSelector = '[data-node-id="pkg:@acme/api"]';
  await expect($(apiSelector)).toBeDisplayed();
  const canvas = await rectOf('map-canvas');
  const before = await rect(apiSelector);

  await $(apiSelector).doubleClick();

  await poll(
    async () => (await rect(apiSelector)).width,
    (w) => w > before.width * 1.3,
  );
  await browser.pause(700); // end of the framing animation
  const after = await rect(apiSelector);
  expect(after.x).toBeGreaterThanOrEqual(canvas.x - 1);
  expect(after.y).toBeGreaterThanOrEqual(canvas.y - 1);
  expect(after.x + after.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(after.y + after.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  expect(after.x + after.width / 2).toBeCloseTo(canvas.x + canvas.width / 2, -1);
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
