import { describe, expect, it } from 'vitest';

import type { DiffResponse, NodeChange } from '../../../core/models/contract';
import { formatOnlyFiles, nodeBadges, prStats } from './diff-layer.logic';

const INVOICES = 'pkg:@acme/web/pages::file:apps/web/pages/Invoices.tsx';
const INVOICES_PAGE = `${INVOICES}::sym:InvoicesPage`;
const CART = 'pkg:@acme/web/components::file:apps/web/components/CartSummary.tsx';
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';
const NEW_FORMAT = 'pkg:@acme/shared/money::file:packages/shared/money/format.ts';
const FORMAT_PRICE = `${NEW_FORMAT}::sym:formatPrice`;
const MONEY = 'pkg:@acme/shared/money::file:packages/shared/money/currency.ts::sym:Money';

function change(partial: Record<string, unknown>): NodeChange {
  return { linesAdded: 0, linesRemoved: 0, ...partial } as NodeChange;
}

// Reproduces acme-shop: Invoices.tsx has +1/-1 and no changed node, but its import of formatPrice
// moved; client.ts only changed its format; format.ts was renamed.
const RESPONSE: DiffResponse = {
  diff: {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    files: [
      { path: 'apps/web/pages/Invoices.tsx', linesAdded: 1, linesRemoved: 1 },
      { path: 'apps/web/components/CartSummary.tsx', linesAdded: 4, linesRemoved: 3 },
      { path: 'packages/shared/http/client.ts', linesAdded: 29, linesRemoved: 29 },
      { path: 'packages/shared/money/format.ts', linesAdded: 0, linesRemoved: 0 },
    ],
    nodes: [change({ id: NEW_FORMAT, status: 'added' })],
    edges: [
      { from: INVOICES, to: FORMAT_PRICE, kind: 'imports', status: 'moved', commit: null },
      { from: INVOICES_PAGE, to: FORMAT_PRICE, kind: 'calls', status: 'moved', commit: null },
      { from: CART, to: MONEY, kind: 'imports', status: 'added', commit: 'c'.repeat(40) },
    ],
  },
  formatOnly: { files: 1, linesAdded: 29, linesRemoved: 29 },
  renames: [{ from: 'apps/web/utils/format.ts', to: 'packages/shared/money/format.ts' }],
};

describe('formatOnlyFiles with changed edges', () => {
  it('excludes a file whose own edge changed, as Invoices.tsx whose import moved', () => {
    expect(formatOnlyFiles(RESPONSE)).not.toContain('apps/web/pages/Invoices.tsx');
  });

  it('excludes a file whose symbol has a changed outgoing edge', () => {
    const response: DiffResponse = {
      ...RESPONSE,
      diff: { ...RESPONSE.diff, edges: RESPONSE.diff.edges.slice(1, 2) },
    };
    expect(formatOnlyFiles(response)).not.toContain('apps/web/pages/Invoices.tsx');
  });

  it('keeps the files that changed only their format', () => {
    expect(formatOnlyFiles(RESPONSE)).toEqual(['packages/shared/http/client.ts']);
  });

  it('does not badge Invoices.tsx, and still badges client.ts', () => {
    expect(nodeBadges(INVOICES, RESPONSE)).toEqual([]);
    expect(nodeBadges(CLIENT, RESPONSE)).toEqual(['format-only']);
  });
});

describe('prStats format-only count', () => {
  it('comes from formatOnly.files of the API', () => {
    expect(prStats(RESPONSE).formatOnlyFiles).toBe(1);
    const other: DiffResponse = { ...RESPONSE, formatOnly: { ...RESPONSE.formatOnly, files: 3 } };
    expect(prStats(other).formatOnlyFiles).toBe(3);
    const none: DiffResponse = {
      ...RESPONSE,
      formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    };
    expect(prStats(none).formatOnlyFiles).toBe(0);
  });
});
