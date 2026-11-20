import { describe, expect, it } from 'vitest';

import type { ReviewSummary } from '../../../core/models/contract';
import { nodeLabel, signalCount } from './review-summary.logic';

const REFRESH = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';

const TOTAL = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:computeTotal';
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';

const EMPTY: ReviewSummary = {
  addedFiles: [],
  couplingsAdded: [],
  couplingsRemoved: [],
  formatOnlyFiles: [],
  movedFiles: [],
  outOfDiff: [],
  removedFiles: [],
  signatures: [],
  violations: [],
};

const signature = (node: string, breaking: boolean): ReviewSummary['signatures'][number] => ({
  node,
  breaking,
  internal: false,
  directCallers: 1,
  transitiveCallers: 1,
  untestedCallers: 0,
});

describe('review summary logic', () => {
  it('labels a symbol by its name and a file by its path', () => {
    expect(nodeLabel(REFRESH)).toBe('SessionStore.refresh');
    expect(nodeLabel('pkg:p::file:src/a.ts')).toBe('src/a.ts');
  });

  it('counts breaking signatures and couplings', () => {
    const summary: ReviewSummary = {
      ...EMPTY,
      signatures: [signature(REFRESH, true)],
      couplingsAdded: [{ from: 'a', to: 'b' }],
    };

    expect(signalCount(summary)).toBe(2);
  });

  it('counts violations, breaking signatures, new and removed couplings and ignored files', () => {
    const summary: ReviewSummary = {
      ...EMPTY,
      signatures: [signature(REFRESH, true), signature(TOTAL, false)],
      violations: [
        {
          rule: 'no-web-to-db',
          edge: { from: REFRESH, to: CLIENT, kind: 'imports' },
          introduced: true,
        },
      ],
      couplingsAdded: [{ from: 'apps/web/components', to: 'packages/db/repos' }],
      couplingsRemoved: [{ from: 'apps/api/routes', to: 'packages/shared/http' }],
      formatOnlyFiles: [
        { path: 'packages/shared/http/client.ts', node: CLIENT, linesAdded: 1, linesRemoved: 1 },
      ],
    };

    expect(signalCount(summary)).toBe(5);
  });

  it('counts only the introduced violations as signals; existing ones are quiet debt', () => {
    const summary: ReviewSummary = {
      ...EMPTY,
      violations: [
        { rule: 'a', edge: { from: REFRESH, to: CLIENT, kind: 'imports' }, introduced: true },
        { rule: 'b', edge: { from: TOTAL, to: CLIENT, kind: 'imports' }, introduced: false },
      ],
    };

    expect(signalCount(summary)).toBe(1);
  });
});
