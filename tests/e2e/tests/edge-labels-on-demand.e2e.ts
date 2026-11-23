import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import {
  clickNode,
  hoverEdge,
  sceneEdge,
  sceneEdges,
  waitForScene,
  type SceneEdge,
} from '../helpers/map-scene';
import { press, tid } from '../helpers/ui';

// U29, on acme-shop (main...feat/promo-codes), level 0, read from the map scene:
//  - at rest only the labels of the edges with a rule violation (web -> db `⚠ 2`, api -> db `⚠ 14`) are visible
//    (`label.visible`; the text of the others stays for the tooltip);
//  - the hovered edge shows its label; selecting `apps/web` shows the labels of its edges only;
//  - the display section has a `toggle-edge-labels-always` switch (`aria-checked`, off by default):
//    on, every edge with something to say shows its label.
const WEB = 'pkg:@acme/web';
const API = 'pkg:@acme/api';
const DB = 'pkg:@acme/db';

const individual = (edges: SceneEdge[]) => edges.filter((e) => !e.merged && !e.coChange);
const REST = [`${API}>${DB}`, `${WEB}>${DB}`];
const shown = async () =>
  individual(await sceneEdges())
    .filter((e) => e.label.visible)
    .map((e) => `${e.from}>${e.to}`)
    .sort();

describe('edge labels on demand', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 }, unchangedEdges: true });
    await waitForScene(
      (s) =>
        [
          [WEB, API],
          [API, DB],
          [WEB, DB],
        ].every(([f, t]) => s.edges.some((e) => e.from === f && e.to === t)),
      15000,
    );
  });

  it('shows only the violation label at rest, but keeps the text for the tooltip', async () => {
    const violation = (await sceneEdge(WEB, DB))!;
    expect(violation.label.text).toBe('⚠ 2');
    expect(violation.label.visible).toBe(true);
    expect(await shown()).toEqual(REST);
    const web = (await sceneEdge(WEB, API))!;
    expect(web.label.text).toBe('3 +1');
    expect(web.label.visible).toBe(false);
  });

  it('shows the label of the hovered edge only', async () => {
    await hoverEdge(WEB, API);
    await waitForScene((s) => individual(s.edges).filter((e) => e.label.visible).length === 3);
    expect(await shown()).toEqual([`${API}>${DB}`, `${WEB}>${API}`, `${WEB}>${DB}`]);
  });

  it('shows the labels of the edges of the selected node', async () => {
    await clickNode(WEB);
    await waitForScene((s) => individual(s.edges).filter((e) => e.label.visible).length === 4);
    expect(await shown()).toEqual([
      `${API}>${DB}`,
      `${WEB}>${API}`,
      `${WEB}>${DB}`,
      `${WEB}>pkg:@acme/shared`,
    ]);

    await press('Escape');
    await waitForScene(
      (s) =>
        individual(s.edges).every((e) => e.label.visible === REST.includes(`${e.from}>${e.to}`)),
      5000,
    );
  });

  it('shows every label with the "always" switch', async () => {
    await expect(tid('toggle-edge-labels-always')).toHaveAttribute('aria-checked', 'false');
    await tid('toggle-edge-labels-always').click();
    await expect(tid('toggle-edge-labels-always')).toHaveAttribute('aria-checked', 'true');
    await waitForScene((s) =>
      individual(s.edges)
        .filter((e) => e.label.text !== '')
        .every((e) => e.label.visible),
    );
    const edges = individual(await sceneEdges());
    const worded = edges.filter((e) => e.label.text !== '');
    expect(worded.length).toBeGreaterThan(0);
    expect(worded.every((e) => e.label.visible)).toBe(true);

    await tid('toggle-edge-labels-always').click();
    await waitForScene(
      (s) =>
        individual(s.edges).every((e) => e.label.visible === REST.includes(`${e.from}>${e.to}`)),
      5000,
    );
  });
});
