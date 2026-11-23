import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import {
  clickNode,
  sceneEdges,
  settledNodeCount,
  waitForNode,
  waitForScene,
  type SceneEdge,
} from '../helpers/map-scene';
import { press, tid } from '../helpers/ui';

// U30, on acme-shop (main...feat/promo-codes), Symbols level (3), read from the map scene:
//  - without selection no edge of the scene has a symbol as an end: they are the pairs of files
//    (one edge per ordered pair, its `count` the number of links);
//  - selecting a file brings the edges of its symbols (an end under the file, a symbol at both
//    ends); the other edges stay on files;
//  - Escape folds them back to the files.
const PAYMENT = 'pkg:@acme/api/billing::file:apps/api/billing/payment.ts';

const isSymbol = (id: string) => id.includes('::sym:');
const individual = (edges: SceneEdge[]) => edges.filter((e) => !e.coChange);
const symbolEdges = (edges: SceneEdge[]) =>
  individual(edges).filter((e) => isSymbol(e.from) || isSymbol(e.to));

describe('edges at the shown level', () => {
  beforeEach(async () => {
    await openRelief({ size: { width: 3200, height: 2000 }, unchangedEdges: true });
    await tid('level-3').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '3');
    await settledNodeCount();
    await waitForNode(PAYMENT);
    await waitForScene((s) => individual(s.edges).length > 0, 15000);
  });

  it('draws the pairs of files, no symbol end, without selection', async () => {
    const edges = individual(await sceneEdges());
    expect(symbolEdges(edges)).toEqual([]);
    const pairs = new Set(edges.map((e) => `${e.from}>${e.to}`));
    expect(pairs.size).toBe(edges.length);
    expect(edges.some((e) => e.count > 1)).toBe(true);
  });

  it('selecting a file draws the edges of its symbols, Escape folds them back', async () => {
    await clickNode(PAYMENT);
    await waitForScene((s) => symbolEdges(s.edges).length > 0, 8000);
    const unfolded = symbolEdges(await sceneEdges());
    expect(unfolded.every((e) => e.from.startsWith(PAYMENT) || e.to.startsWith(PAYMENT))).toBe(
      true,
    );

    await press('Escape');
    await waitForScene((s) => symbolEdges(s.edges).length === 0, 8000);
  });
});
