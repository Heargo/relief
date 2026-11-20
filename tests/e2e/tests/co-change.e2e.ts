// @fixture cochange
import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { poll, settledAt, tid } from '../helpers/ui';

// Contract with the UI, on the cochange fixture (its `.md` files have no adapter: the layer does not
// depend on the language), exploration mode off or on:
//  - the `layers-section` has `toggle-co-change-layer` ("Couplage logique" in French,
//    `aria-checked`), off by default;
//  - while on, the SVG of the map draws at least one `co-change-edge` (dashed, its own colour),
//    one per pair of files changed together at least twice in the last 90 days (threshold of
//    `relief.config.yaml`, 2 commits by default); off, there is none;
//  - the layer asks the `co_change` command, never the snapshot, for its data.
// At HEAD, `src/a.md` and `src/b.md` are both present and changed together in 2 commits of the
// 90 days (the mass rewrite is ignored): that pair gives the edge.
const edgeCount = () =>
  browser.execute(() => document.querySelectorAll('[data-testid="co-change-edge"]').length);

describe('co-change layer', () => {
  beforeEach(async () => {
    await openRelief({ lang: 'fr', size: { width: 1600, height: 1000 } });
    // U16: the co-change layer is an Explorer layer
    await tid('explore-toggle').click();
    await tid('level-3').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '3');
    await settledAt('[data-testid="map-node"]');
  });

  it('is off by default and draws no co-change edge', async () => {
    await expect(tid('toggle-co-change-layer')).toHaveText(
      expect.stringContaining('Couplage logique'),
    );
    await expect(tid('toggle-co-change-layer')).toHaveAttribute('aria-checked', 'false');
    expect(await edgeCount()).toBe(0);
  });

  it('shows at least one edge when the layer is on, and none when it is off again', async () => {
    await tid('toggle-co-change-layer').click();
    await expect(tid('toggle-co-change-layer')).toHaveAttribute('aria-checked', 'true');
    await poll(edgeCount, (n) => n >= 1, 8000);
    await $('[data-testid="co-change-edge"]').waitForExist();
    await tid('toggle-co-change-layer').click();
    await poll(edgeCount, (n) => n === 0);
  });
});
