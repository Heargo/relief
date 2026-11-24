import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { nodeContent } from './node-content.logic';
import { buildNodeInfos, labelOf } from './node-info.logic';
import { hasRepoLevel, mapLevels, repoBoxes } from './repo-level.logic';

// K08, UI logic seam. A workspace snapshot has one `repo:<name>` node per repository (no parent,
// with its branch and labels), under which come the systems; a repository snapshot has none, and
// its root `pkg:` node of kind `repo` is not a level.

function node(id: string, kind: NodeKind, parent: string | null, extra: Partial<Node> = {}): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h', ...extra };
}

const MONO: GraphSnapshot = {
  commit: '1'.repeat(40),
  edges: [],
  nodes: [
    node('pkg:acme', 'repo', null),
    node('pkg:acme/web', 'service', 'pkg:acme'),
    node('pkg:acme/web::file:a.ts', 'file', 'pkg:acme/web'),
  ],
};

const WORKSPACE: GraphSnapshot = {
  commit: '2'.repeat(40),
  edges: [],
  nodes: [
    node('repo:web', 'repo', null, { branch: 'feat/order-badge', labels: ['front'] }),
    node('repo:web/pkg:shop-web', 'package', 'repo:web'),
    node('repo:web/pkg:shop-web::file:src/a.ts', 'file', 'repo:web/pkg:shop-web'),
    node('repo:api', 'repo', null, { branch: 'feat/order-total', labels: ['back', 'ops'] }),
    // The root of the repository, as the detectors name it, sits between the repo and its systems.
    node('repo:api/pkg:shop-api', 'repo', 'repo:api'),
    node('repo:api/pkg:shop-api/src', 'module', 'repo:api/pkg:shop-api'),
    node('repo:api/pkg:shop-api/src::file:src/b.ts', 'file', 'repo:api/pkg:shop-api/src'),
  ],
};

describe('hasRepoLevel', () => {
  it('is false on a single repository, whose root node has kind repo too', () => {
    expect(hasRepoLevel(MONO)).toBe(false);
  });

  it('is true when the snapshot has repo:<name> nodes', () => {
    expect(hasRepoLevel(WORKSPACE)).toBe(true);
  });
});

describe('mapLevels', () => {
  it('lists system, modules, files and symbols on a single repository', () => {
    expect(mapLevels(MONO)).toEqual(['system', 'modules', 'files', 'symbols']);
  });

  it('puts repos above them on a workspace', () => {
    expect(mapLevels(WORKSPACE)).toEqual(['repos', 'system', 'modules', 'files', 'symbols']);
  });
});

describe('repoBoxes', () => {
  it('is empty on a single repository', () => {
    expect(repoBoxes(MONO)).toEqual([]);
  });

  it('gives each repository its name, branch, labels and systems, in snapshot order', () => {
    expect(repoBoxes(WORKSPACE)).toEqual([
      {
        id: 'repo:web',
        name: 'web',
        branch: 'feat/order-badge',
        labels: ['front'],
        systems: ['repo:web/pkg:shop-web'],
      },
      {
        id: 'repo:api',
        name: 'api',
        branch: 'feat/order-total',
        labels: ['back', 'ops'],
        systems: ['repo:api/pkg:shop-api'],
      },
    ]);
  });
});

describe('the box of a repository', () => {
  it('is named after the repository, whatever the prefix of the ids below', () => {
    expect(labelOf('repo:web', 'repo')).toBe('web');
    expect(labelOf('repo:web/pkg:shop-web', 'package')).toBe('shop-web');
    expect(labelOf('repo:web/pkg:shop-web::file:src/a.ts', 'file')).toBe('a.ts');
  });

  it('says its branch and its labels', () => {
    const info = buildNodeInfos(WORKSPACE).get('repo:api');
    expect(info).toBeDefined();
    const content = nodeContent(info!, 'box', 'large');
    expect(content?.label).toBe('api');
    expect(content?.sub).toBe('feat/order-total');
    expect(content?.tags).toEqual(['back', 'ops']);
  });
});
