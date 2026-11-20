// @fixture deep
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// U14: containers open on their width alone; when the reserved header is too small for a readable
// title (font under 11 px) the title moves to a `.tab` straddling the top border of the container.
const ZOOM_CLICKS = [2, 4, 6];

interface Report {
  open: number;
  overlaps: string[];
  missingTab: string[];
  badTab: string[];
  tabs: number;
  closedWide: string[];
  smallHeaderOpenModules: number;
}

async function inspect(): Promise<Report> {
  return browser.execute(() => {
    const TOL = 0.75;
    const shownEl = (el: HTMLElement | null) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="map-node"]'),
    ).map((el) => ({ el, id: el.dataset['nodeId'] ?? '', box: el.getBoundingClientRect() }));
    const r: Report = {
      open: 0,
      overlaps: [],
      missingTab: [],
      badTab: [],
      tabs: 0,
      closedWide: [],
      smallHeaderOpenModules: 0,
    };
    for (const node of nodes) {
      const mode = node.el.dataset['mode'];
      const kind = node.el.dataset['kind'];
      if (mode === 'box' && kind === 'module' && node.box.width >= 300 + TOL) {
        const hasKids = node.el.querySelector('[data-testid="map-node"]') !== null;
        // a module made only of externals or without children has nothing to open
        if (hasKids) r.closedWide.push(`${node.id} (${Math.round(node.box.width)} px)`);
      }
      if (mode !== 'open') continue;
      const hd = node.el.querySelector<HTMLElement>(':scope > .hd');
      if (!hd || !shownEl(hd)) continue;
      r.open++;
      const bottom = hd.getBoundingClientRect().bottom;
      for (const other of nodes) {
        if (other === node || other.box.width === 0) continue;
        const inside =
          other.box.left >= node.box.left - TOL &&
          other.box.right <= node.box.right + TOL &&
          other.box.top >= node.box.top - TOL &&
          other.box.bottom <= node.box.bottom + TOL;
        if (inside && other.box.top < bottom - TOL) r.overlaps.push(`${node.id} > ${other.id}`);
      }
      const label = hd.querySelector<HTMLElement>('.lb');
      const hasLabel =
        !!label && !!label.textContent?.trim() && getComputedStyle(label).display !== 'none';
      const tab = node.el.querySelector<HTMLElement>(':scope > .tab');
      if (kind === 'module' && !hasLabel) r.smallHeaderOpenModules++;
      if (hasLabel) continue;
      if (!tab || !shownEl(tab) || !tab.textContent?.trim()) {
        r.missingTab.push(node.id);
        continue;
      }
      r.tabs++;
      const t = tab.getBoundingClientRect();
      const straddles = t.top < node.box.top + TOL && t.bottom > node.box.top - TOL;
      const inside = t.left >= node.box.left - TOL && t.right <= node.box.right + TOL;
      if (!straddles || !inside || !tab.title) r.badTab.push(node.id);
    }
    return r;
  });
}

it('containers open on width alone and a tab names each one without a header label, at three zooms', async () => {
  await openRelief({ size: { width: 1600, height: 900 } });
  await tid('zoom-fit').click();
  await browser.pause(800);
  let tabs = 0;
  let done = 0;
  for (const clicks of ZOOM_CLICKS) {
    for (let i = done; i < clicks; i++) await tid('zoom-in').click();
    done = clicks;
    await browser.pause(800);
    const r = await inspect();
    expect({ clicks, overlaps: r.overlaps }).toEqual({ clicks, overlaps: [] });
    expect({ clicks, missingTab: r.missingTab }).toEqual({ clicks, missingTab: [] });
    expect({ clicks, badTab: r.badTab }).toEqual({ clicks, badTab: [] });
    tabs += r.tabs;
  }
  expect(tabs).toBeGreaterThan(0);
});

it('a module wide enough on screen is open, even when its header is too small for a readable title', async () => {
  await openRelief({ size: { width: 1600, height: 900 } });
  await tid('zoom-fit').click();
  await browser.pause(800);
  let smallOpen = 0;
  for (let clicks = 1; clicks <= 6; clicks++) {
    await tid('zoom-in').click();
    await browser.pause(700);
    const r = await inspect();
    expect({ clicks, closedWide: r.closedWide }).toEqual({ clicks, closedWide: [] });
    smallOpen += r.smallHeaderOpenModules;
  }
  // U10 kept every module closed while its header font was under 8 px
  expect(smallOpen).toBeGreaterThan(0);
});
