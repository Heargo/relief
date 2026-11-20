import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Node } from '../../../core/models/contract';
import { buildNodeInfos, labelOf } from './node-info.logic';

function node(fields: Pick<Node, 'id' | 'kind' | 'subkind' | 'parent' | 'path'>): Node {
  return { visibility: 'public', contentHash: '', ...fields };
}

const GRAPH = {
  commit: 'c0ffee',
  edges: [],
  nodes: [
    node({ id: 'pkg:acme-shop', kind: 'repo', subkind: 'system', parent: null }),
    node({
      id: 'pkg:@acme/api',
      kind: 'service',
      subkind: 'http-server',
      parent: 'pkg:acme-shop',
      path: 'apps/api',
    }),
    node({
      id: 'pkg:@acme/api/auth',
      kind: 'module',
      subkind: 'module',
      parent: 'pkg:@acme/api',
      path: 'apps/api/auth',
    }),
    node({
      id: 'pkg:@acme/api/auth::file:apps/api/auth/session.ts',
      kind: 'file',
      subkind: 'source',
      parent: 'pkg:@acme/api/auth',
    }),
    node({ id: 'pkg:@acme/legacy', kind: 'package', subkind: 'library', parent: 'pkg:acme-shop' }),
  ],
} satisfies GraphSnapshot;

describe('node labels with a path', () => {
  it('labels a workspace system by its path, not its package name', () => {
    const infos = buildNodeInfos(GRAPH);
    expect(infos.get('pkg:@acme/api')?.label).toBe('apps/api');
  });

  it('keeps deriving the label from the id when the system has no path', () => {
    const infos = buildNodeInfos(GRAPH);
    expect(infos.get('pkg:@acme/legacy')?.label).toBe('@acme/legacy');
    expect(infos.get('pkg:acme-shop')?.label).toBe('acme-shop');
  });

  it('labels a module by its last segment with a trailing slash', () => {
    const infos = buildNodeInfos(GRAPH);
    expect(infos.get('pkg:@acme/api/auth')?.label).toBe('auth/');
  });

  it('labels the file under a module by its file name and counts it in the module', () => {
    const infos = buildNodeInfos(GRAPH);
    expect(infos.get('pkg:@acme/api/auth::file:apps/api/auth/session.ts')?.label).toBe(
      'session.ts',
    );
    expect(infos.get('pkg:@acme/api/auth')?.files).toBe(1);
    expect(infos.get('pkg:@acme/api')?.files).toBe(1);
  });

  it('labelOf still derives a module label from the id alone', () => {
    expect(labelOf('pkg:@acme/api/auth', 'module')).toBe('auth/');
  });
});
