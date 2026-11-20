import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { poll, tid } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the "Disposition" / "Layout" section is `data-testid="layout-section"`, in the left panel;
//  - its two options are buttons `data-testid="layout-fewer-crossings"` (default) and
//    `data-testid="layout-raw-grid"`, the active one has `aria-pressed="true"`;
//  - no crossing count is shown (removed in S14: not useful, and costly at every zoom step).
const NODES = '[data-testid="map-node"]:not([data-mode="ghost"])';

async function positions(): Promise<Record<string, string>> {
  return browser.execute((selector: string) => {
    const entries: [string, string][] = [];
    for (const n of document.querySelectorAll(selector)) {
      const r = n.getBoundingClientRect();
      entries.push([n.getAttribute('data-node-id') ?? '', `${Math.round(r.x)},${Math.round(r.y)}`]);
    }
    return Object.fromEntries(entries);
  }, NODES);
}

const same = (a: Record<string, string>, b: Record<string, string>) =>
  JSON.stringify(a) === JSON.stringify(b);

it('the layout section offers "Fewer crossings" (default) and "Raw grid", with no crossing count', async () => {
  await openRelief();
  const section = tid('layout-section');
  await expect(section).toBeDisplayed();
  await expect(section.$('[data-testid="layout-fewer-crossings"]')).toHaveText(
    expect.stringMatching(/fewer crossings/i),
  );
  await expect(section.$('[data-testid="layout-fewer-crossings"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(section.$('[data-testid="layout-raw-grid"]')).toHaveText(
    expect.stringMatching(/raw grid/i),
  );
  await expect(section.$('[data-testid="layout-raw-grid"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(tid('crossings-optimized')).not.toBeExisting();
  await expect(tid('crossings-raw')).not.toBeExisting();
  await expect(tid('crossings-visible')).not.toBeExisting();
});

it('switching to "Raw grid" changes the layout, and the choice survives a reload', async () => {
  await openRelief();
  await expect(tid('map-canvas')).toBeDisplayed();
  await expect($(NODES)).toBeDisplayed();
  const optimized = await positions();

  await tid('layout-raw-grid').click();
  await expect(tid('layout-raw-grid')).toHaveAttribute('aria-pressed', 'true');
  // the switch is animated: wait for the nodes to settle somewhere else
  await poll(positions, (p) => !same(p, optimized));
  await browser.pause(800);
  const raw = await positions();
  expect(raw).not.toEqual(optimized);

  await browser.refresh();
  await expect(tid('repo-name')).toBeDisplayed();
  await expect(tid('layout-raw-grid')).toHaveAttribute('aria-pressed', 'true');
  await expect(tid('layout-fewer-crossings')).toHaveAttribute('aria-pressed', 'false');
  await poll(positions, (p) => same(p, raw));

  await tid('layout-fewer-crossings').click();
  await poll(positions, (p) => same(p, optimized));
});
