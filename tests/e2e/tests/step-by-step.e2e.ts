import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { scene, waitForScene } from '../helpers/map-scene';
import { clearReviewState } from '../helpers/review-state';
import { poll, tid, tids } from '../helpers/ui';

// R19, on acme-shop (default fixture, reading order of the PR). Contract with the UI:
//  - the reading-order section has a switch `toggle-step-by-step` (`aria-pressed="true"` when on);
//  - with it on, `reading-row` of the current entry carries `data-current="true"` (the others "false");
//  - `reading-next` / `reading-previous` (buttons of the section) move the current entry and frame it;
//  - in the scene, every node outside the current entry, its direct neighbours and their boxes is
//    `faded`, and so is every edge outside them (`SceneEdge.faded`); off, nothing is faded.
const currentId = async () => {
  for (const row of await tids('reading-row')) {
    if ((await row.getAttribute('data-current')) === 'true')
      return row.getAttribute('data-node-id');
  }
  return null;
};

describe('step by step', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief();
  });

  it('fades everything but the second entry and its neighbours, "next" changes the entry, off restores the map', async () => {
    // The reading order is loaded with the diff: wait for its rows.
    await poll(
      async () => (await tids('reading-row')).length,
      (n) => n >= 3,
    );
    const rows = await tids('reading-row');
    const second = (await rows[1].getAttribute('data-node-id'))!;
    await rows[1].click();

    await tid('toggle-step-by-step').click();
    await expect(tid('toggle-step-by-step')).toHaveAttribute('aria-pressed', 'true');
    expect(await currentId()).toBe(second);

    // Two identical reads of the faded flags: the scene is no longer in transition.
    const stable = async () => {
      let last = '';
      for (let i = 0; i < 40; i++) {
        const s = await scene();
        const sig = JSON.stringify([s.nodes.map((n) => n.faded), s.edges.map((e) => e.faded)]);
        if (sig === last) return s;
        last = sig;
        await browser.pause(300);
      }
      throw new Error('scene never settled');
    };
    const s = await stable();
    // The exact rule is unit-tested (step-focus.logic); here, what the reviewer sees: the entry,
    // its direct neighbours and the edges between them stay sharp, and part of the map is faded.
    // The scene may hold symbol-level edges: an end inside the current entry counts as the entry.
    const inEntry = (id: string) => id === second || id.startsWith(`${second}::`);
    const touching = s.edges.filter((e) => inEntry(e.from) || inEntry(e.to));
    const neighbours = touching.map((e) => (inEntry(e.from) ? e.to : e.from));
    expect(s.nodes.find((n) => n.id === second)?.faded).toBe(false);
    for (const id of neighbours) {
      const node = s.nodes.find((n) => n.id === id);
      if (node) expect(node.faded).toBe(false);
    }
    for (const e of touching) expect(e.faded).toBe(false);
    expect(s.nodes.some((n) => n.faded)).toBe(true);

    await tid('reading-next').click();
    await poll(currentId, (id) => id !== null && id !== second);
    const next = (await currentId())!;
    expect(next).toBe(await (await tids('reading-row'))[2].getAttribute('data-node-id'));
    await poll(
      async () => (await scene()).nodes.find((n) => n.id === next)?.faded,
      (faded) => faded === false,
    );

    await tid('toggle-step-by-step').click();
    await expect(tid('toggle-step-by-step')).toHaveAttribute('aria-pressed', 'false');
    await poll(
      async () => {
        const s = await scene();
        return s.nodes.some((n) => n.faded) || s.edges.some((e) => e.faded);
      },
      (any) => any === false,
    );
  });
});
