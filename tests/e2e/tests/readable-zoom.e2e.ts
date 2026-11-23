// @fixture deep
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneNodes } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// U10: the map stays readable at every zoom, on `deep` (folders nested 4 to 6 levels, wide and
// narrow mixed). At three intermediate zooms, read from the map scene:
//  - the header of every open node (`header: 'header'`, `headerHeight` px from its top) ends above the
//    top of each of its children (no overlap);
//  - no shown label (`labelShown`) is clipped by its box (`labelClipped` is false).
const ZOOM_CLICKS = [2, 4, 6];

interface Report {
  open: number;
  overlaps: string[];
  clipped: string[];
}

async function inspect(): Promise<Report> {
  const nodes = await sceneNodes();
  expect(nodes.length).toBeGreaterThan(0);
  for (const node of nodes) {
    expect(typeof node.headerHeight).toBe('number');
    expect(typeof node.labelClipped).toBe('boolean');
  }
  const TOL = 0.75;
  const overlaps: string[] = [];
  const clipped: string[] = [];
  let open = 0;
  for (const node of nodes) {
    if (node.mode === 'open' && node.header === 'header') {
      open++;
      const bottom = node.top + node.headerHeight;
      for (const other of nodes) {
        if (other === node || other.width === 0) continue;
        const inside =
          other.left >= node.left - TOL &&
          other.left + other.width <= node.left + node.width + TOL &&
          other.top >= node.top - TOL &&
          other.top + other.height <= node.top + node.height + TOL;
        if (inside && other.top < bottom - TOL) overlaps.push(`${node.id} > ${other.id}`);
      }
    }
    if (node.labelShown && node.labelClipped) clipped.push(node.id);
  }
  return { open, overlaps, clipped };
}

it('headers never overlap their children and no visible label overflows, at three zooms', async () => {
  await openRelief({ size: { width: 1600, height: 900 } });
  await tid('zoom-fit').click();
  await browser.pause(800);
  let opened = 0;
  let done = 0;
  for (const clicks of ZOOM_CLICKS) {
    for (let i = done; i < clicks; i++) await tid('zoom-in').click();
    done = clicks;
    await browser.pause(800);
    const report = await inspect();
    opened += report.open;
    expect({ clicks, overlaps: report.overlaps }).toEqual({ clicks, overlaps: [] });
    expect({ clicks, clipped: report.clipped }).toEqual({ clicks, clipped: [] });
  }
  expect(opened).toBeGreaterThan(3);
});

it('a closed box too small for its label shows none (the name stays in the title)', async () => {
  await openRelief({ size: { width: 1600, height: 900 } });
  await tid('zoom-fit').click();
  await browser.pause(800);
  const small = (await sceneNodes()).filter(
    (n) => n.mode === 'box' && (n.height < 14 || n.width < 28),
  );
  const tooSmall = { bad: small.filter((n) => n.label !== '' && n.labelShown).map((n) => n.id) };
  expect(tooSmall.bad).toEqual([]);
});
