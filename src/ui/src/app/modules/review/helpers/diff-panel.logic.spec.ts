import { describe, expect, it } from 'vitest';

import type { DiffResponse, GraphSnapshot, NodeChange } from '../../../core/models/contract';
import {
  baseNodeId,
  fileSymbolChanges,
  formatOnlyHiddenLines,
  reasonTranslation,
  startLine,
} from './diff-panel.logic';

const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const TOTAL = `${INVOICE}::sym:computeTotal`;
const RENDER = `${INVOICE}::sym:renderInvoice`;
const OTHER = 'pkg:@acme/api/billing::file:apps/api/billing/discount.ts::sym:applyDiscount';
const OLD_PRICE = 'pkg:@acme/web/utils::file:apps/web/utils/format.ts::sym:formatPrice';
const NEW_PRICE = 'pkg:@acme/shared/money::file:packages/shared/money/format.ts::sym:formatPrice';
const CLIENT = 'pkg:@acme/shared/http::file:packages/shared/http/client.ts';

const change = (c: Partial<NodeChange> & { id: string; status: NodeChange['status'] }) =>
  ({ linesAdded: 0, linesRemoved: 0, ...c }) as NodeChange;

const RESPONSE: DiffResponse = {
  diff: {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    files: [
      { path: 'apps/api/billing/invoice.ts', linesAdded: 4, linesRemoved: 1 },
      { path: 'packages/shared/http/client.ts', linesAdded: 29, linesRemoved: 29 },
    ],
    nodes: [
      change({ id: TOTAL, status: 'modified', body: true }),
      change({ id: RENDER, status: 'added' }),
      change({ id: OTHER, status: 'added' }),
      change({ id: NEW_PRICE, status: 'moved', from: OLD_PRICE, body: false }),
    ],
    edges: [],
  },
  formatOnly: { files: 1, linesAdded: 29, linesRemoved: 29 },
  renames: [],
};

describe('fileSymbolChanges', () => {
  it('lists the changed symbols of the file, in the order of the diff', () => {
    expect(fileSymbolChanges(INVOICE, RESPONSE).map((c) => c.id)).toEqual([TOTAL, RENDER]);
  });

  it('is empty for a file without a changed symbol', () => {
    expect(fileSymbolChanges(CLIENT, RESPONSE)).toEqual([]);
  });
});

describe('baseNodeId', () => {
  it('is the id of the node when it did not move', () => {
    expect(baseNodeId(TOTAL, RESPONSE)).toBe(TOTAL);
  });

  it('is the former id of a moved symbol', () => {
    expect(baseNodeId(NEW_PRICE, RESPONSE)).toBe(OLD_PRICE);
  });
});

describe('formatOnlyHiddenLines', () => {
  it('counts the added and removed text lines of a format-only file', () => {
    expect(formatOnlyHiddenLines(CLIENT, RESPONSE)).toBe(58);
  });

  it('is null for a file with a changed symbol', () => {
    expect(formatOnlyHiddenLines(INVOICE, RESPONSE)).toBeNull();
  });
});

describe('reasonTranslation', () => {
  it('maps a code to its review.reason key', () => {
    expect(reasonTranslation({ code: 'returnWidenedNull' } as never)).toEqual({
      key: 'review.reason.returnWidenedNull',
      params: {},
    });
  });

  it('passes the parameter name along', () => {
    expect(reasonTranslation({ code: 'paramRequiredAdded', param: 'discount' } as never)).toEqual({
      key: 'review.reason.paramRequiredAdded',
      params: { param: 'discount' },
    });
  });
});

describe('startLine', () => {
  const graph = {
    commit: 'c',
    edges: [],
    nodes: [
      {
        id: TOTAL,
        kind: 'symbol',
        subkind: 'function',
        parent: null,
        visibility: 'public',
        contentHash: 'h',
        span: { startLine: 15, endLine: 19 },
      },
    ],
  } as GraphSnapshot;

  it('is the first line of the symbol in the file', () => {
    expect(startLine(graph, TOTAL)).toBe(15);
  });

  it('is 1 for a node without a span, an unknown node or no graph', () => {
    expect(startLine(graph, RENDER)).toBe(1);
    expect(startLine(null, TOTAL)).toBe(1);
  });
});
