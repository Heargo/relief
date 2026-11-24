// @workspace shop-space
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { waitForNode, waitForScene } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// Ticket K09, on the workspace `tests/fixtures/shop-space` (`web` is front, `api` is back):
//  - each `workspace-repo` row of the left panel shows its labels (`repo-label`) and has a
//    `repo-labels-edit` button that opens a `repo-label-option-<label>` toggle per available label;
//    choosing one saves the label in the workspace file and the repository box shows it (`tags`);
//  - the Display section has a `label-filter-<label>` toggle (`aria-pressed`) per label: with one
//    on, the scene only holds the repositories that carry it, and what they contain.
// The test writes in the workspace file shared by the specs of the run: it puts it back as it was.

const SIZE = { width: 1280, height: 800 };
const FILE = () => join(process.env['RELIEF_E2E_REPO'] as string, 'shop.relief.json');

let original = '';

before(() => {
  original = readFileSync(FILE(), 'utf8');
});

afterEach(() => {
  writeFileSync(FILE(), original);
});

it('labels a repository from the left panel, then filters the map by that label', async () => {
  await openRelief({ size: SIZE });
  const rows = await $$('[data-testid="workspace-repo"]');
  expect(rows).toHaveLength(2);
  const api = rows[1];
  await expect(api.$('[data-testid="repo-label"]')).toHaveText('back');

  await api.$('[data-testid="repo-labels-edit"]').click();
  await api.$('[data-testid="repo-label-option-ops"]').click();
  await browser.waitUntil(async () => (await api.$$('[data-testid="repo-label"]')).length === 2);

  expect(JSON.parse(readFileSync(FILE(), 'utf8')).repos[1].labels).toEqual(['back', 'ops']);

  await tid('level-0').click();
  expect((await waitForNode('repo:api')).tags).toEqual(['back', 'ops']);
  expect((await waitForNode('repo:web')).tags).toEqual(['front']);

  await expect(tid('label-filter-ops')).toHaveAttribute('aria-pressed', 'false');
  await tid('label-filter-ops').click();
  await expect(tid('label-filter-ops')).toHaveAttribute('aria-pressed', 'true');
  await waitForScene(
    (s) =>
      s.nodes.some((n) => n.id === 'repo:api') && !s.nodes.some((n) => n.id.startsWith('repo:web')),
  );

  await tid('label-filter-ops').click();
  await waitForScene((s) => s.nodes.some((n) => n.id === 'repo:web'));
});
