import { describe, expect, it } from 'vitest';

import { displayPath, nodeLabel } from './review-summary.logic';

// K08: a file or symbol of a workspace is read with its repository.

describe('nodeLabel and displayPath in a workspace', () => {
  it('shows the repository before the file path', () => {
    expect(nodeLabel('repo:api/pkg:shop-api/src::file:src/orders.ts')).toBe('api · src/orders.ts');
    expect(displayPath('repo:api/src/orders.ts')).toBe('api · src/orders.ts');
  });

  it('shows the repository before the symbol name', () => {
    expect(nodeLabel('repo:web/pkg:w/src::file:src/a.ts::sym:renderOrders')).toBe(
      'web · renderOrders',
    );
  });

  it('is unchanged on a single repository', () => {
    expect(nodeLabel('pkg:acme::file:src/a.ts')).toBe('src/a.ts');
    expect(nodeLabel('pkg:acme::file:src/a.ts::sym:f')).toBe('f');
    expect(displayPath('src/a.ts')).toBe('src/a.ts');
  });
});
