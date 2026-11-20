import { describe, expect, it } from 'vitest';

import type { Edge, GraphSnapshot, Node } from '../../../core/models/contract';
import { codeLines, nodePanelFacts } from './node-panel.logic';

const API = 'pkg:@acme/api';
const BILLING = 'pkg:@acme/api/billing';
const INVOICE = `${BILLING}::file:apps/api/billing/invoice.ts`;
const TOTAL = `${INVOICE}::sym:computeTotal`;
const RENDER = `${INVOICE}::sym:renderInvoice`;
const CHECKOUT = `${API}/routes::file:apps/api/routes/checkout.ts::sym:checkout`;
const RENEW = `${API}/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscription`;
const MONEY = `${API}/billing::file:apps/api/billing/money.ts::sym:formatMoney`;

function node(fields: Partial<Node> & Pick<Node, 'id' | 'kind'>): Node {
  return { subkind: 'function', visibility: 'public', contentHash: '', parent: null, ...fields };
}
function edge(from: string, to: string, kind: Edge['kind'] = 'calls'): Edge {
  return { from, to, kind, precision: 'resolved' };
}

const GRAPH: GraphSnapshot = {
  commit: 'c0ffee',
  nodes: [
    node({ id: API, kind: 'service', subkind: 'http-server', path: 'apps/api' }),
    node({ id: BILLING, kind: 'module', subkind: 'module', parent: API, path: 'apps/api/billing' }),
    node({ id: INVOICE, kind: 'file', subkind: 'source', parent: BILLING }),
    node({
      id: TOTAL,
      kind: 'symbol',
      parent: INVOICE,
      span: { startLine: 7, endLine: 12 },
    }),
    node({
      id: RENDER,
      kind: 'symbol',
      parent: INVOICE,
      visibility: 'internal',
      span: { startLine: 1, endLine: 5 },
    }),
    node({ id: CHECKOUT, kind: 'symbol', parent: API }),
    node({ id: RENEW, kind: 'symbol', parent: API }),
    node({ id: MONEY, kind: 'symbol', parent: API }),
  ],
  edges: [
    edge(RENEW, TOTAL),
    edge(CHECKOUT, TOTAL),
    edge(CHECKOUT, TOTAL),
    edge(CHECKOUT, TOTAL, 'references'),
    edge(TOTAL, MONEY),
  ],
};

describe('nodePanelFacts', () => {
  it('returns null for an unknown id', () => {
    expect(nodePanelFacts(GRAPH, 'pkg:nope')).toBeNull();
  });

  it('gives name, type, visibility and file path of a symbol', () => {
    const facts = nodePanelFacts(GRAPH, RENDER);
    expect(facts?.name).toBe('renderInvoice');
    expect(facts?.kind).toBe('symbol');
    expect(facts?.subkind).toBe('function');
    expect(facts?.visibility).toBe('internal');
    expect(facts?.path).toBe('apps/api/billing/invoice.ts');
  });

  it('uses the node path for a module', () => {
    const facts = nodePanelFacts(GRAPH, BILLING);
    expect(facts?.path).toBe('apps/api/billing');
    expect(facts?.name).toBe('billing/');
  });

  it('lists the children of a container, and none for a symbol', () => {
    expect(nodePanelFacts(GRAPH, INVOICE)?.children.map((c) => c.id)).toEqual([RENDER, TOTAL]);
    expect(nodePanelFacts(GRAPH, TOTAL)?.children).toEqual([]);
  });

  it('puts a child without span after the ones with a span, in source order', () => {
    const noSpan = `${INVOICE}::sym:aaaNoSpan`;
    const graph = {
      ...GRAPH,
      nodes: [...GRAPH.nodes, node({ id: noSpan, kind: 'symbol', parent: INVOICE })],
    };
    expect(nodePanelFacts(graph, INVOICE)?.children.map((c) => c.id)).toEqual([
      RENDER,
      TOTAL,
      noSpan,
    ]);
  });

  it('lists callers in usedBy, deduplicated per kind and sorted by label then kind', () => {
    const facts = nodePanelFacts(GRAPH, TOTAL);
    expect(facts?.usedBy.map((l) => [l.id, l.edgeKind])).toEqual([
      [CHECKOUT, 'calls'],
      [CHECKOUT, 'references'],
      [RENEW, 'calls'],
    ]);
  });

  it('lists dependencies in uses with the link type', () => {
    const facts = nodePanelFacts(GRAPH, TOTAL);
    expect(facts?.uses.map((l) => [l.id, l.edgeKind, l.label])).toEqual([
      [MONEY, 'calls', 'formatMoney'],
    ]);
  });
});

describe('codeLines', () => {
  it('numbers lines from the start line', () => {
    expect(codeLines('a\nb\nc', 7)).toEqual([
      { number: 7, text: 'a' },
      { number: 8, text: 'b' },
      { number: 9, text: 'c' },
    ]);
  });

  it('ignores the trailing newline and handles empty text', () => {
    expect(codeLines('a\n', 1)).toEqual([{ number: 1, text: 'a' }]);
    expect(codeLines('', 1)).toEqual([]);
  });

  it('keeps blank lines in the middle', () => {
    expect(codeLines('a\n\nb\n', 1).map((l) => l.number)).toEqual([1, 2, 3]);
  });
});
