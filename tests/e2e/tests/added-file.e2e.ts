// @fixture tiny
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { sceneNodesMatching, waitForNodeMatching } from '../helpers/map-scene';
import { tid } from '../helpers/ui';

// The app is opened without a range: the core compares HEAD with the working tree, so the map
// must draw the working tree. A file added (not committed) at the root and one in a subfolder
// appear on the map marked `added` once "Reload" reads the working tree again. The files are
// removed afterwards: the fixture is shared by the specs on tiny.

const ROOT_FILE = 'added-at-root.ts';
const SUB_FILE = 'src/added-in-folder.ts';

function repoPath(file: string): string {
  const repo = process.env['RELIEF_E2E_REPO'];
  if (!repo) throw new Error('RELIEF_E2E_REPO is not set (see wdio.base.ts)');
  return join(repo, file);
}

const isFile = (file: string) => (id: string) => id.endsWith(`::file:${file}`);
const statusOf = async (file: string) => (await sceneNodesMatching(isFile(file)))[0]?.status;

describe('a file added in the working tree', () => {
  afterEach(() => {
    rmSync(repoPath(ROOT_FILE), { force: true });
    rmSync(repoPath(SUB_FILE), { force: true });
  });

  it('shows on the map, marked added, at the root and in a subfolder', async () => {
    await openRelief({ size: { width: 3200, height: 2000 } });
    writeFileSync(repoPath(ROOT_FILE), 'export const rootValue = 1;\n');
    writeFileSync(repoPath(SUB_FILE), 'export const folderValue = 2;\n');
    await tid('menu-trigger-settings').click();
    await tid('menu-item-reload').click();
    await tid('level-2').click();
    await expect(tid('current-level')).toHaveAttribute('data-level', '2');
    await waitForNodeMatching(isFile(ROOT_FILE), 15000);
    await browser.waitUntil(async () => (await statusOf(ROOT_FILE)) === 'added', {
      timeout: 15000,
      timeoutMsg: `${ROOT_FILE} never appeared on the map as added`,
    });
    expect(await statusOf(SUB_FILE)).toBe('added');
  });
});
