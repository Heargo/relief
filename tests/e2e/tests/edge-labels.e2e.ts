import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneEdge, waitForScene } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// Edge labels and node headers like the mockup, on acme-shop (main...feat/promo-codes), level 0,
// read from the map scene:
//  - an edge label is the scene `label` of the edge (text, `cls`: base | add | del | viol | mov);
//  - a node label is the `label` of a scene node, shown in its header (``labelShown`, `labelClipped`).
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';

// A large viewport, so that the level-0 edges are longer than the 60 px under which a label is hidden.
it('web -> db reads "⚠ 2" (rule violation), web -> api "3 +1"', async () => {
  await openRelief({ size: { width: 3200, height: 2000 } });
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  await waitForScene((s) => s.edges.length > 0);

  const violation = (await sceneEdge(WEB, DB))!;
  expect(violation.label.text).toBe('⚠ 2');
  expect(violation.label.visible).toBe(true);
  expect(violation.label.cls).toContain('viol');

  const changed = (await sceneEdge(WEB, API))!;
  expect(changed.label.text).toBe('3 +1');
  expect(changed.label.cls).toContain('base');
});

it('shows the whole label of every system at 1280 px, without ellipsis', async () => {
  await openRelief({ size: { width: 1280, height: 720 } });
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  const systems = (await waitForScene((s) => s.nodes.some((n) => n.kind === 'package'))).nodes
    .filter((n) => n.kind === 'package' && n.mode !== 'ghost')
    .map((n) => ({
      text: n.label,
      shown: n.labelShown,
      clipped: n.labelClipped,
    }));
  expect(systems.length).toBeGreaterThan(0);
  for (const label of systems) {
    expect(label.text.length).toBeGreaterThan(0);
    expect({ text: label.text, shown: label.shown, clipped: label.clipped }).toEqual({
      text: label.text,
      shown: true,
      clipped: false,
    });
  }
});
