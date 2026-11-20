// @fixture deep
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// U10: the map stays readable at every zoom, on `deep` (folders nested 4 to 6 levels, wide and
// narrow mixed). At three intermediate zooms:
//  - the header of every open node ends above the top of each of its children (no overlap);
//  - no visible label is clipped by its box (`.hd`: scrollWidth <= clientWidth, scrollHeight <= clientHeight).
const ZOOM_CLICKS = [2, 4, 6];

interface Report {
  open: number;
  overlaps: string[];
  clipped: string[];
}

async function inspect(): Promise<Report> {
  return browser.execute(() => {
    const TOL = 0.75;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="map-node"]'),
    ).map((el) => ({ el, id: el.dataset['nodeId'] ?? '', box: el.getBoundingClientRect() }));
    const overlaps: string[] = [];
    const clipped: string[] = [];
    let open = 0;
    for (const node of nodes) {
      const hd = node.el.querySelector<HTMLElement>(':scope > .hd');
      if (!hd) continue;
      const style = getComputedStyle(hd);
      const shown =
        style.display !== 'none' && style.visibility !== 'hidden' && hd.getClientRects().length > 0;
      if (node.el.dataset['mode'] === 'open' && shown) {
        open++;
        const bottom = hd.getBoundingClientRect().bottom;
        for (const other of nodes) {
          if (other === node || other.box.width === 0) continue;
          const inside =
            other.box.left >= node.box.left - TOL &&
            other.box.right <= node.box.right + TOL &&
            other.box.top >= node.box.top - TOL &&
            other.box.bottom <= node.box.bottom + TOL;
          if (inside && other.box.top < bottom - TOL) overlaps.push(`${node.id} > ${other.id}`);
        }
      }
      const label = hd.querySelector<HTMLElement>('.lb');
      if (shown && label && label.textContent && getComputedStyle(label).display !== 'none') {
        if (hd.scrollWidth > hd.clientWidth || hd.scrollHeight > hd.clientHeight) {
          clipped.push(
            `${node.id} (${hd.scrollWidth}x${hd.scrollHeight} in ${hd.clientWidth}x${hd.clientHeight})`,
          );
        }
      }
    }
    return { open, overlaps, clipped };
  });
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
  const tooSmall = await browser.execute(() => {
    const bad: string[] = [];
    let small = 0;
    for (const el of document.querySelectorAll<HTMLElement>(
      '[data-testid="map-node"][data-mode="box"]',
    )) {
      const box = el.getBoundingClientRect();
      if (box.height >= 14 && box.width >= 28) continue;
      small++;
      const label = el.querySelector<HTMLElement>(':scope > .hd > .lb');
      const visible =
        !!label &&
        label.textContent !== '' &&
        getComputedStyle(label).display !== 'none' &&
        getComputedStyle(label).visibility !== 'hidden';
      if (visible) bad.push(el.dataset['nodeId'] ?? '');
    }
    return { small, bad };
  });
  expect(tooSmall.bad).toEqual([]);
});
