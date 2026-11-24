import { expect } from '@wdio/globals';
import { clearReviewState } from '../helpers/review-state';
import { openRelief } from '../helpers/open-relief';
import { sceneNode, sceneNodesMatching, waitForScene } from '../helpers/map-scene';
import { tid, toggleLayer } from '../helpers/ui';

// Contract with the UI, on main...feat/promo-codes:
//  - the left panel has a `toggle-hide-external` button (`aria-checked`), on by default;
//  - while it is on, no node of the map scene has an id starting with `pkg:external`; switching
//    it off shows the node `pkg:external` (the external group).

const isExternal = (id: string) => id.startsWith('pkg:external');

describe('hide external dependencies', () => {
  beforeEach(async () => {
    clearReviewState();
    await openRelief();
  });

  it('hides them at load, and shows the external group once switched off', async () => {
    await expect(tid('toggle-hide-external')).toHaveAttribute('aria-checked', 'true');
    expect(await sceneNodesMatching(isExternal)).toEqual([]);

    await toggleLayer('toggle-hide-external');
    await expect(tid('toggle-hide-external')).toHaveAttribute('aria-checked', 'false');
    await waitForScene((s) => s.nodes.some((n) => isExternal(n.id)));
    expect(await sceneNode('pkg:external')).toBeDefined();
  });
});
