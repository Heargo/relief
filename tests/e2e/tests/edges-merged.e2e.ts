// @fixture dense
import { $, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (S08), on dense (4,500 aggregated edges at the files level, far above the
// threshold of 500 edges on screen): the unchanged edges are drawn in one `path`
// `[data-testid="map-edges-merged"]` (no `g.edge`, no arrow, no label), and a click on one of its
// strokes selects that edge: its panel (`edge-panel`) opens.
const MERGED = '[data-testid="map-edges-merged"]';

describe('an edge merged in the common path', () => {
  it('is selected by a click on its stroke and opens the edge inspector', async () => {
    await openRelief({ size: { width: 1600, height: 900 } });
    await tid('level-2').click();
    await $(MERGED).waitForExist({ timeout: 20000 });

    // A point of the first curve of the path (its middle), in client coordinates.
    const point = await browser.execute((sel: string) => {
      const path = document.querySelector<SVGPathElement>(sel);
      const d = path?.getAttribute('d') ?? '';
      const m = d.match(/^M(-?[\d.]+),(-?[\d.]+)Q(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)/);
      const ctm = path?.getScreenCTM();
      if (!m || !ctm) return null;
      const [x0, y0, cx, cy, x1, y1] = m.slice(1).map(Number);
      const p = new DOMPoint((x0 + 2 * cx + x1) / 4, (y0 + 2 * cy + y1) / 4).matrixTransform(ctm);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    }, MERGED);
    expect(point).not.toBeNull();

    await browser.action('pointer').move({ x: point!.x, y: point!.y }).down().up().perform();
    await expect(tid('edge-panel')).toBeDisplayed();
  });
});
