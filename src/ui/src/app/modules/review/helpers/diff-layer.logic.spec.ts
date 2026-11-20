import { describe, expect, it } from 'vitest';

import type {
  DiffResponse,
  EdgeChange,
  MetaResponse,
  NodeChange,
} from '../../../core/models/contract';
import {
  aggregateEdgeStatus,
  containerStatus,
  diffIntensity,
  edgeStatus,
  formatOnlyFiles,
  nodeBadges,
  nodeStatus,
  oldLocations,
  prStats,
  rangeChoices,
  rangeOptions,
  WORKTREE_RANGE,
  currentRange,
} from './diff-layer.logic';

/** A reason code as the API serializes it (the contract type is generated). */
const reasonCode = (code: string, param?: string) =>
  ({ code, ...(param ? { param } : {}) }) as never;

const BILLING = 'pkg:@acme/api/billing';
const DISCOUNT = `${BILLING}::file:apps/api/billing/discount.ts`;
const LEGACY = `${BILLING}::file:apps/api/billing/legacyCoupon.ts`;
const OLD_FORMAT = 'pkg:@acme/web/utils::file:apps/web/utils/format.ts';
const NEW_FORMAT = 'pkg:@acme/shared/money::file:packages/shared/money/format.ts';
const OLD_PRICE = `${OLD_FORMAT}::sym:formatPrice`;
const NEW_PRICE = `${NEW_FORMAT}::sym:formatPrice`;
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';
const REFRESH = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';
const COMPUTE = `${BILLING}::file:apps/api/billing/invoice.ts::sym:computeTotal`;
const CHECKOUT_TOTALS =
  'pkg:@acme/web/pages::file:apps/web/pages/Checkout.tsx::sym:useCheckoutTotals';
const CHARGE = `${BILLING}::file:apps/api/billing/payment.ts::sym:chargeCustomer`;
const APPLY = `${DISCOUNT}::sym:applyDiscount`;
const IS_EXPIRED = `${DISCOUNT}::sym:isExpired`;
const LEGACY_APPLY = `${LEGACY}::sym:applyLegacyCoupon`;

function change(partial: Record<string, unknown>): NodeChange {
  return { linesAdded: 0, linesRemoved: 0, ...partial } as NodeChange;
}

const RESPONSE: DiffResponse = {
  diff: {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    files: [
      { path: 'apps/api/billing/discount.ts', linesAdded: 17, linesRemoved: 0 },
      { path: 'apps/api/billing/invoice.ts', linesAdded: 4, linesRemoved: 2 },
      { path: 'apps/api/billing/legacyCoupon.ts', linesAdded: 0, linesRemoved: 6 },
    ],
    nodes: [
      change({ id: DISCOUNT, status: 'added' }),
      change({ id: LEGACY, status: 'removed' }),
      change({ id: NEW_FORMAT, status: 'added' }),
      change({ id: OLD_FORMAT, status: 'removed' }),
      change({ id: APPLY, status: 'added' }),
      change({ id: IS_EXPIRED, status: 'added' }),
      change({ id: LEGACY_APPLY, status: 'removed' }),
      change({ id: NEW_PRICE, status: 'moved', from: OLD_PRICE, body: false }),
      change({
        id: REFRESH,
        status: 'modified',
        body: true,
        signature: {
          before: 'a',
          after: 'b',
          breaking: true,
          internal: false,
          reason: reasonCode('returnWidenedNull'),
        },
      }),
      change({
        id: COMPUTE,
        status: 'modified',
        body: true,
        signature: {
          before: 'a',
          after: 'b',
          breaking: false,
          internal: false,
          reason: reasonCode('paramOptionalAdded'),
        },
      }),
      change({
        id: CHECKOUT_TOTALS,
        status: 'modified',
        body: true,
        signature: {
          before: 'a',
          after: 'b',
          breaking: false,
          internal: true,
          reason: reasonCode('paramOptionalAdded'),
        },
      }),
      change({ id: CHARGE, status: 'modified', body: true }),
    ],
    edges: [],
  },
  formatOnly: { files: 1, linesAdded: 29, linesRemoved: 29 },
  renames: [{ from: 'apps/web/utils/format.ts', to: 'packages/shared/money/format.ts' }],
};

describe('containerStatus', () => {
  it('is unchanged when no descendant changed', () => {
    expect(containerStatus(['unchanged', 'unchanged'])).toBe('unchanged');
    expect(containerStatus([])).toBe('unchanged');
  });

  it('is added when every descendant is added, removed when every one is removed', () => {
    expect(containerStatus(['added', 'added'])).toBe('added');
    expect(containerStatus(['removed', 'removed', 'removed'])).toBe('removed');
  });

  it('is moved when every descendant is moved', () => {
    expect(containerStatus(['moved', 'moved'])).toBe('moved');
  });

  it('is modified when changes are mixed or sit next to unchanged descendants', () => {
    expect(containerStatus(['added', 'removed'])).toBe('modified');
    expect(containerStatus(['added', 'unchanged'])).toBe('modified');
    expect(containerStatus(['modified'])).toBe('modified');
    expect(containerStatus(['moved', 'added'])).toBe('modified');
  });
});

describe('nodeStatus', () => {
  it('reads the status of a changed node and defaults to unchanged', () => {
    expect(nodeStatus(DISCOUNT, RESPONSE)).toBe('added');
    expect(nodeStatus(LEGACY, RESPONSE)).toBe('removed');
    expect(nodeStatus(COMPUTE, RESPONSE)).toBe('modified');
    expect(nodeStatus(NEW_PRICE, RESPONSE)).toBe('moved');
    expect(nodeStatus('pkg:@acme/api/billing::file:apps/api/billing/other.ts', RESPONSE)).toBe(
      'unchanged',
    );
  });

  it('shows a renamed file as moved, not added', () => {
    expect(nodeStatus(NEW_FORMAT, RESPONSE)).toBe('moved');
  });
});

describe('oldLocations', () => {
  it('lists the old place of the moved symbols and of the renamed files', () => {
    expect([...oldLocations(RESPONSE)].sort()).toEqual([OLD_FORMAT, OLD_PRICE].sort());
  });
});

describe('diffIntensity', () => {
  it('grows with the number of changed lines', () => {
    expect(diffIntensity(0)).toBe(1);
    expect(diffIntensity(5)).toBe(1);
    expect(diffIntensity(6)).toBe(2);
    expect(diffIntensity(20)).toBe(2);
    expect(diffIntensity(21)).toBe(3);
  });
});

describe('nodeBadges', () => {
  it('flags a breaking public signature', () => {
    expect(nodeBadges(REFRESH, RESPONSE)).toEqual(['breaking-api']);
  });

  it('flags a non-breaking public signature', () => {
    expect(nodeBadges(COMPUTE, RESPONSE)).toEqual(['api']);
  });

  it('flags an internal signature', () => {
    expect(nodeBadges(CHECKOUT_TOTALS, RESPONSE)).toEqual(['internal-signature']);
  });

  it('has no badge for a body-only change or an added node', () => {
    expect(nodeBadges(CHARGE, RESPONSE)).toEqual([]);
    expect(nodeBadges(APPLY, RESPONSE)).toEqual([]);
  });

  it('flags a file whose only change is its format', () => {
    const response: DiffResponse = {
      ...RESPONSE,
      diff: {
        ...RESPONSE.diff,
        files: [
          ...RESPONSE.diff.files,
          { path: 'packages/shared/http/client.ts', linesAdded: 29, linesRemoved: 29 },
        ],
      },
    };
    expect(nodeBadges(CLIENT, response)).toEqual(['format-only']);
  });
});

describe('formatOnlyFiles', () => {
  it('keeps the changed files without any node change, a renamed file aside', () => {
    const response: DiffResponse = {
      ...RESPONSE,
      diff: {
        ...RESPONSE.diff,
        files: [
          { path: 'apps/api/billing/invoice.ts', linesAdded: 4, linesRemoved: 2 },
          { path: 'apps/api/billing/payment.ts', linesAdded: 2, linesRemoved: 0 },
          { path: 'packages/shared/http/client.ts', linesAdded: 29, linesRemoved: 29 },
          { path: 'packages/shared/money/format.ts', linesAdded: 0, linesRemoved: 0 },
        ],
      },
    };
    // invoice.ts has no file node here but its symbol computeTotal changed; payment.ts likewise.
    expect(formatOnlyFiles(response)).toEqual(['packages/shared/http/client.ts']);
  });
});

describe('edgeStatus', () => {
  const edges: EdgeChange[] = [
    { from: 'a', to: 'b', kind: 'imports', status: 'added', commit: null },
    { from: 'a', to: 'c', kind: 'imports', status: 'removed', commit: null },
    { from: 'a', to: 'd', kind: 'calls', status: 'moved', commit: null },
  ];
  const diff = { ...RESPONSE.diff, edges };

  it('reads the status of a changed edge by (from, to, kind)', () => {
    expect(edgeStatus({ from: 'a', to: 'b', kind: 'imports', precision: 'resolved' }, diff)).toBe(
      'added',
    );
    expect(edgeStatus({ from: 'a', to: 'c', kind: 'imports', precision: 'resolved' }, diff)).toBe(
      'removed',
    );
    expect(edgeStatus({ from: 'a', to: 'd', kind: 'calls', precision: 'resolved' }, diff)).toBe(
      'moved',
    );
  });

  it('is unchanged when the edge is not listed, or listed with another kind', () => {
    expect(edgeStatus({ from: 'a', to: 'b', kind: 'calls', precision: 'resolved' }, diff)).toBe(
      'unchanged',
    );
    expect(edgeStatus({ from: 'x', to: 'y', kind: 'calls', precision: 'resolved' }, diff)).toBe(
      'unchanged',
    );
  });
});

describe('aggregateEdgeStatus', () => {
  it('is added or removed only when every fine link is', () => {
    expect(aggregateEdgeStatus(['added', 'added'])).toBe('added');
    expect(aggregateEdgeStatus(['removed'])).toBe('removed');
  });

  it('is unchanged when no link changed, modified when links differ', () => {
    expect(aggregateEdgeStatus(['unchanged', 'unchanged'])).toBe('unchanged');
    expect(aggregateEdgeStatus(['added', 'unchanged'])).toBe('modified');
    expect(aggregateEdgeStatus(['added', 'removed'])).toBe('modified');
  });
});

describe('prStats', () => {
  it('sums files and lines and counts the symbols and signatures per status', () => {
    expect(prStats(RESPONSE)).toEqual({
      files: 3,
      linesAdded: 21,
      linesRemoved: 8,
      symbols: { added: 2, removed: 1, modified: 4, moved: 1 },
      signatures: 3,
      filesMoved: 1,
      formatOnlyFiles: 1,
    });
  });

  it('is all zeros for an empty diff', () => {
    const empty: DiffResponse = {
      diff: { base: 'a', head: 'a', files: [], nodes: [], edges: [] },
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
      renames: [],
    };
    expect(prStats(empty)).toEqual({
      files: 0,
      linesAdded: 0,
      linesRemoved: 0,
      symbols: { added: 0, removed: 0, modified: 0, moved: 0 },
      signatures: 0,
      filesMoved: 0,
      formatOnlyFiles: 0,
    });
  });
});

describe('rangeOptions', () => {
  const meta: MetaResponse = {
    repo: 'acme-shop',
    range: 'main...feat/promo-codes',
    branches: ['feat/promo-codes', 'main'],
    tags: ['v1'],
  };

  it('offers a range between the refs of /api/meta, in both directions', () => {
    const options = rangeOptions(meta);
    expect(options).toContain('main...feat/promo-codes');
    expect(options).toContain('feat/promo-codes...main');
    expect(options).toContain('main...v1');
  });

  it('never offers a range of a ref against itself', () => {
    expect(rangeOptions(meta)).not.toContain('main...main');
  });
});

describe('rangeChoices without a range', () => {
  const meta: MetaResponse = {
    repo: 'tiny',
    range: null,
    branches: ['feat', 'main'],
    tags: [],
  };

  it('puts the working tree first and makes it the current value', () => {
    expect(WORKTREE_RANGE).toBe('WORKTREE');
    expect(rangeChoices(meta, null)[0]).toBe('WORKTREE');
    expect(currentRange(null)).toBe('WORKTREE');
    expect(rangeChoices(meta, null)).toContain('main...feat');
  });

  it('changes nothing with a range', () => {
    expect(currentRange('main...feat')).toBe('main...feat');
    expect(rangeChoices(meta, 'main...feat')).toEqual(['feat...main', 'main...feat']);
    expect(rangeChoices(meta, 'a..b')).toEqual(['a..b', 'feat...main', 'main...feat']);
  });
});
