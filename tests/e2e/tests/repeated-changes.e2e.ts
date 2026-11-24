// @fixture repeated-imports
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneNodes, waitForScene } from '../helpers/map-scene';
import { clearReviewState } from '../helpers/review-state';
import { poll, tid, tids } from '../helpers/ui';

// R18, on `repeated-imports` (main...feat/migration): f1..f4 add the same import (helpers), f5 and
// f6 add another one. Contract with the UI:
//  - the overview (right panel, nothing selected) has a `overview-group[data-group="repeated"]`
//    with one `overview-row` reading "4 files: …";
//  - the reading order lists 3 entries (f1 for the group, f5, f6), the f1 row carries
//    `data-group-size="4"`; the progress reads "0/3";
//  - on the map (files level) f1 has `repeated: { count: 4 }`, f2..f4 are `faded`;
//  - marking f1 seen shows `reading-group-prompt`; `reading-group-mark` marks f2..f4 seen too.
const file = (n: number) => new RegExp(`::file:src/features/f${n}\\.ts$`);
const rowOf = async (n: number) => {
  for (const row of await tids('reading-row')) {
    if (file(n).test((await row.getAttribute('data-node-id')) ?? '')) return row;
  }
  throw new Error(`no reading row for f${n}`);
};

describe('repeated changes', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief({
      query: '?range=main...feat/migration',
      size: { width: 2400, height: 1400 },
    });
  });

  it('shows one group line in the overview', async () => {
    const rows = await tids('overview-row');
    const texts: string[] = [];
    for (const row of rows) {
      if ((await row.getAttribute('data-repeated')) !== null) texts.push(await row.getText());
    }
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('4 files:');
  });

  it('lists the group once in the reading order', async () => {
    await poll(
      async () => (await tids('reading-row')).length,
      (n) => n === 3,
    );
    await expect(tid('reading-progress')).toHaveText(expect.stringContaining('0/3'));
    await expect(await rowOf(1)).toHaveAttribute('data-group-size', '4');
  });

  it('fades the other members on the map, "×4" on the representative', async () => {
    await tid('level-2').click();
    const scene = await waitForScene(
      (s) => [1, 2, 3, 4].every((n) => s.nodes.some((node) => file(n).test(node.id))),
      15000,
    );
    const by = (n: number) => scene.nodes.find((node) => file(n).test(node.id))!;
    expect(by(1).repeated).toEqual({ count: 4 });
    expect(by(1).faded).toBe(false);
    for (const n of [2, 3, 4]) {
      expect(by(n).faded).toBe(true);
      expect(by(n).repeated).toBeNull();
    }
    expect(by(5).faded).toBe(false);
    expect(by(5).repeated).toBeNull();
  });

  it('proposes to mark the whole group once the representative is seen', async () => {
    await poll(
      async () => (await tids('reading-row')).length,
      (n) => n === 3,
    );
    await (await rowOf(1)).click();
    await browser.keys('v');
    await expect(tid('reading-group-prompt')).toBeDisplayed();

    await tid('reading-group-mark').click();

    await expect(tid('reading-group-prompt')).not.toBeExisting();
    await tid('level-2').click();
    const scene = await waitForScene(
      (s) =>
        [1, 2, 3, 4].every((n) => s.nodes.some((node) => file(n).test(node.id) && node.reading)),
      15000,
    );
    for (const n of [1, 2, 3, 4]) {
      expect(scene.nodes.find((node) => file(n).test(node.id))?.reading?.seen).toBe(true);
    }
    expect(scene.nodes.find((node) => file(5).test(node.id))?.reading?.seen).toBe(false);
    expect((await sceneNodes()).length).toBeGreaterThan(0);
  });
});
