import { describe, expect, it } from 'vitest';

import type { GraphDiff, GraphSnapshot } from './contract';

describe('contract.ts', () => {
  it('types a snapshot and a diff built from the JSON contract', async () => {
    const snapshot: GraphSnapshot = { commit: 'c0ffee', nodes: [], edges: [] } as GraphSnapshot;
    const diff: GraphDiff = {
      base: 'a',
      head: 'b',
      nodes: [],
      files: [],
      edges: [],
    };
    expect(snapshot.commit).toBe('c0ffee');
    expect(diff.head).toBe('b');
    // A type-only import is erased: force the module to exist at runtime too.
    await expect(import('./contract')).resolves.toBeDefined();
  });
});
