// @fixture dense
import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { clickSceneEdge, waitForScene } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// Contract with the UI (S08), on dense (4,500 aggregated edges at the files level, far above the
// threshold of 500 edges on screen): the unchanged edges are drawn merged (`merged: true` in the
// map scene), and a click at the middle of one of them selects that edge: its panel
// (`edge-panel`) opens.
describe('an edge merged in the common path', () => {
  it('is selected by a click on its stroke and opens the edge inspector', async () => {
    await openRelief({ size: { width: 1600, height: 900 }, unchangedEdges: true });
    await tid('level-2').click();
    const found = await waitForScene((s) => s.edges.some((e) => e.merged), 20000);
    const merged = found.edges.find((e) => e.merged)!;

    await clickSceneEdge(merged);
    await expect(tid('edge-panel')).toBeDisplayed();
  });
});
