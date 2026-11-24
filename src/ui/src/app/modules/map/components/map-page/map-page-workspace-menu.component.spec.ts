import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

// K13: the Workspace menu entries "Add a repository to the workspace…" (in a workspace) and "Open
// this repository as a workspace" (on a single repository) are active: each asks the native folder
// picker (mocked behind ReliefApiService) and calls the commands of K07. The path of the open
// repository comes from `meta.path` (the folder of the repository), added by this ticket.

const REPO_META = {
  repo: 'acme',
  path: '/work/acme',
  range: 'main...feat/x',
  branches: ['main', 'feat/x'],
  tags: [],
};

const WORKSPACE_META = {
  repo: 'shop',
  path: '/work/shop',
  range: null,
  branches: [],
  tags: [],
  workspace: { repos: [{ name: 'web', labels: ['front'] }] },
};

const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      {
        id: 'pkg:@acme/web',
        kind: 'package',
        subkind: 'ts',
        parent: null,
        visibility: 'public',
        contentHash: 'h',
      },
    ],
  },
  meta: {},
};

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  readingOrder: vi.fn(),
  reviewState: vi.fn(),
  workspaceComparisons: vi.fn(),
  workspaceLabels: vi.fn(),
  pickRepoFolder: vi.fn(),
  addWorkspaceRepo: vi.fn(),
  openRepoAsWorkspace: vi.fn(),
};

const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render(meta: unknown) {
  api.meta.mockResolvedValue(meta);
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use('en').toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function choose(
  fixture: { whenStable(): Promise<unknown> },
  el: HTMLElement,
  item: string,
): Promise<void> {
  byId(el, 'menu-trigger-workspace')?.click();
  await fixture.whenStable();
  byId(el, `menu-item-${item}`)?.click();
  await fixture.whenStable();
  await fixture.whenStable();
}

describe('MapPageComponent, workspace menu entries that build a workspace (K13)', () => {
  beforeEach(() => {
    api.meta.mockReset();
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockResolvedValue({
      diff: { base: 'a', head: 'b', files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    });
    api.readingOrder.mockReset().mockResolvedValue({ items: [] });
    api.reviewState.mockReset().mockResolvedValue({ seen: [] });
    api.workspaceComparisons.mockReset().mockResolvedValue([]);
    api.workspaceLabels.mockReset().mockResolvedValue(['front', 'back']);
    api.pickRepoFolder.mockReset().mockResolvedValue('/picked/folder');
    api.addWorkspaceRepo.mockReset().mockResolvedValue(WORKSPACE_META);
    api.openRepoAsWorkspace.mockReset().mockResolvedValue(WORKSPACE_META);
  });

  it('"Add a repository to the workspace…" picks a folder and adds that repository, without labels', async () => {
    const { fixture, el } = await render(WORKSPACE_META);
    await choose(fixture, el, 'add-repo');
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.addWorkspaceRepo).toHaveBeenCalledExactlyOnceWith('/picked/folder', []);
  });

  it('adds nothing when the folder picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValue(null);
    const { fixture, el } = await render(WORKSPACE_META);
    await choose(fixture, el, 'add-repo');
    expect(api.addWorkspaceRepo).not.toHaveBeenCalled();
  });

  it('"Open this repository as a workspace" picks the workspace folder and opens the repository in it', async () => {
    const { fixture, el } = await render(REPO_META);
    await choose(fixture, el, 'open-as-workspace');
    expect(api.pickRepoFolder).toHaveBeenCalledOnce();
    expect(api.openRepoAsWorkspace).toHaveBeenCalledExactlyOnceWith('/work/acme', '/picked/folder');
  });

  it('opens nothing as a workspace when the folder picker is cancelled', async () => {
    api.pickRepoFolder.mockResolvedValue(null);
    const { fixture, el } = await render(REPO_META);
    await choose(fixture, el, 'open-as-workspace');
    expect(api.openRepoAsWorkspace).not.toHaveBeenCalled();
  });

  it('a failed addition does not leave the map', async () => {
    api.addWorkspaceRepo.mockRejectedValue(new Error("'web' is already in the workspace"));
    const { fixture, el } = await render(WORKSPACE_META);
    await choose(fixture, el, 'add-repo');
    expect(byId(el, 'repo-name')?.textContent?.trim()).toBe('shop');
    expect(byId(el, 'welcome')).toBeNull();
  });
});
