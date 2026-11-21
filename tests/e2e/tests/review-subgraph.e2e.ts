// @fixture wide
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneNodes, waitForNode } from '../helpers/map-scene';
import { clearReviewState } from '../helpers/review-state';
import { poll } from '../helpers/ui';

// Contract with the UI, on `wide` (6 012 nodes, more than the 2 000 the map shows) with changes in
// the working tree (`?range=WORKTREE`, "Relire la PR" on): the review shows the subgraph of the
// diff, so the modified files are nodes of the map scene (id of the form
// `pkg:wide/packages/pkg-NN::file:packages/pkg-NN/file-NNN.ts`) without any zoom, in two different
// packages, and the screen holds at most 2 000 nodes. `wide` is shared by the specs of the run:
// the edited files are restored.

const EDITED = ['packages/pkg-03/file-005.ts', 'packages/pkg-07/file-250.ts'];

function repoPath(file: string): string {
  const repo = process.env['RELIEF_E2E_REPO'];
  if (!repo) throw new Error('RELIEF_E2E_REPO is not set (see wdio.base.ts)');
  return join(repo, file);
}

const idOf = (file: string) => `pkg:wide/${file.split('/').slice(0, 2).join('/')}::file:${file}`;

describe('review of a big repository', () => {
  const originals = new Map<string, string>();

  beforeEach(async () => {
    clearReviewState();
    for (const file of EDITED) {
      originals.set(file, readFileSync(repoPath(file), 'utf8'));
      appendFileSync(repoPath(file), '\nexport function reviewProbe(): number {\n  return 1;\n}\n');
    }
    await openRelief({ query: '?range=WORKTREE', size: { width: 3600, height: 2000 } });
  });

  afterEach(() => {
    for (const [file, text] of originals) writeFileSync(repoPath(file), text);
    clearReviewState();
  });

  it('shows the modified files without zooming, and at most 2 000 nodes', async () => {
    for (const file of EDITED) {
      await waitForNode(idOf(file), 90000);
    }
    const count = await poll(
      async () => (await sceneNodes()).length,
      (n) => n > 0,
      5000,
    );
    expect(count).toBeLessThanOrEqual(2000);
  });
});
