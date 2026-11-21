// @fixture deep
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneNodes, type SceneNode } from '../helpers/map-scene';
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
  const nodes = await sceneNodes();
  const TOL = 0.75;
  const r: Report = {
    open: 0,
    overlaps: [],
    missingTab: [],
    badTab: [],
    tabs: 0,
    closedWide: [],
    smallHeaderOpenModules: 0,
  };
  const inside = (inner: SceneNode, outer: SceneNode) =>
    inner.left >= outer.left - TOL &&
    inner.left + inner.width <= outer.left + outer.width + TOL &&
    inner.top >= outer.top - TOL &&
    inner.top + inner.height <= outer.top + outer.height + TOL;
  for (const node of nodes) {
    if (node.mode === 'box' && node.kind === 'module' && node.width >= 300 + TOL) {
      // a module made only of externals or without children has nothing to open
      if (nodes.some((other) => other !== node && other.width > 0 && inside(other, node))) {
        r.closedWide.push(`${node.id} (${Math.round(node.width)} px)`);
      }
    }
    if (node.mode !== 'open' || node.headerHeight <= 0) continue;
    r.open++;
    const bottom = node.top + node.headerHeight;
    for (const other of nodes) {
      if (other === node || other.width === 0) continue;
      if (inside(other, node) && other.top < bottom - TOL)
        r.overlaps.push(`${node.id} > ${other.id}`);
    }
    const hasLabel = node.header === 'header' && node.labelShown && node.label.trim() !== '';
    if (node.kind === 'module' && !hasLabel) r.smallHeaderOpenModules++;
    if (hasLabel) continue;
    if (node.header !== 'tab' || node.label.trim() === '' || !node.tabRect) {
      r.missingTab.push(node.id);
      continue;
    }
    r.tabs++;
    const t = node.tabRect;
    const straddles = t.top < node.top + TOL && t.top + t.height > node.top - TOL;
    const within = t.left >= node.left - TOL && t.left + t.width <= node.left + node.width + TOL;
    if (!straddles || !within) r.badTab.push(node.id);
  }
  return r;
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
