import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { forceClick, press, tid } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the sticky header of the right panel is `data-testid="inspector-badge"` with
//    `data-kind="node|edge|none"`; `inspector-close` clears the selection;
//  - the panel of an edge has its two ends as buttons `inspector-from` / `inspector-to`
//    (`data-node-id`);
//  - the panel of a node lists its edges: `node-edges-depends-on` and `node-edges-used-by`, one
//    `node-edge-row` per edge (`data-from`, `data-to`).
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const WEB_DB = `[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"]`;

const kind = () => tid('inspector-badge');

it('a node, then one of its edges, then Escape: Node, Edge, Overview', async () => {
  await openRelief();
  await $(WEB_DB).waitForExist(); // the edge exists once the diff is loaded
  await expect(kind()).toHaveAttribute('data-kind', 'none');

  // Reach the node `apps/web` through an edge, by its end button.
  await forceClick(WEB_DB);
  await expect(kind()).toHaveAttribute('data-kind', 'edge');
  await expect(tid('inspector-from')).toHaveAttribute('data-node-id', WEB);
  await expect(tid('inspector-to')).toHaveAttribute('data-node-id', DB);
  await tid('inspector-from').click();
  await expect(kind()).toHaveAttribute('data-kind', 'node');
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', WEB);

  // Its edge to packages/db is in "depends on": a click selects the edge.
  const row = $(
    `[data-testid="node-edges-depends-on"] [data-testid="node-edge-row"][data-from="${WEB}"][data-to="${DB}"]`,
  );
  await expect(row).toBeDisplayed();
  await row.click();
  await expect(kind()).toHaveAttribute('data-kind', 'edge');
  await expect(tid('inspector-from')).toHaveAttribute('data-node-id', WEB);
  await expect(tid('inspector-to')).toHaveAttribute('data-node-id', DB);
  await expect($$('[data-testid="edge-link"]')).toBeElementsArrayOfSize(
    Number(await $(WEB_DB).getAttribute('data-count')),
  );

  await press('Escape');
  await expect(kind()).toHaveAttribute('data-kind', 'none');
  await expect($$('[data-testid="edge-panel"]')).toBeElementsArrayOfSize(0);
});

it('the cross of the header clears the selection', async () => {
  await openRelief();
  await $(WEB_DB).waitForExist(); // the edge exists once the diff is loaded
  await forceClick(WEB_DB);
  await expect(kind()).toHaveAttribute('data-kind', 'edge');
  await tid('inspector-close').click();
  await expect(kind()).toHaveAttribute('data-kind', 'none');
});
