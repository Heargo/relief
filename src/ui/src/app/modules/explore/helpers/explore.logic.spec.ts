import { describe, expect, it } from 'vitest';

import type {
  DiffResponse,
  Edge,
  GraphSnapshot,
  Node,
  SnapshotResponse,
} from '../../../core/models/contract';
import { entryPoints, exploreView, overview } from './explore.logic';

// Expected API (explore.logic.ts, pure):
//  - exploreView(mode, head, base, response): { graph, marks } for the toggle "Relire la PR" /
//    "Explorer le repo" (mode 'review' | 'explore'). In 'review' the graph is the head plus what
//    only the base knows (removed nodes, former places, removed edges) and `marks` are the diff
//    marks; in 'explore' the graph is exactly the head (no removed node, no former place, no
//    removed edge) and `marks` is empty;
//  - entryPoints(graph): the nodes carrying `entry: true` grouped by `entryType`, groups in the
//    order route, page, job, script, main (empty groups left out), nodes sorted by id:
//    [{ type, nodes }];
//  - overview(response): { detector, packages, externals, files, symbols, links } where `links`
//    counts the edges by kind (kinds with no edge are absent). The contract gains on Node:
//    `entry?: boolean` and `entryType?: string` (JSON `entry`, `entryType`).
const API = 'pkg:@acme/api/billing';
const LEGACY = `${API}::file:apps/api/billing/legacyCoupon.ts`;
const INVOICE = `${API}::file:apps/api/billing/invoice.ts`;
const TOTAL = `${INVOICE}::sym:computeTotal`;
const ROUTES = 'pkg:@acme/api/routes::file:apps/api/routes/invoices.ts';
const LIST = `${ROUTES}::sym:listInvoices`;
const GET = `${ROUTES}::sym:getInvoice`;
const JOB = 'pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscriptions';
const LOGIN = 'pkg:@acme/web/pages::file:apps/web/pages/Login.tsx';
const CHECKOUT = 'pkg:@acme/web/pages::file:apps/web/pages/Checkout.tsx';
const START = 'pkg:@acme/api::script:start';

function node(id: string, kind: Node['kind'], extra: Partial<Node> = {}): Node {
  return { id, kind, subkind: 'x', parent: null, visibility: 'public', contentHash: 'h', ...extra };
}
function edge(from: string, to: string, kind: Edge['kind']): Edge {
  return { from, to, kind, precision: 'resolved' };
}
function graph(nodes: Node[], edges: Edge[] = []): GraphSnapshot {
  return { commit: 'c', nodes, edges };
}

const HEAD = graph(
  [node(INVOICE, 'file'), node(TOTAL, 'symbol')],
  [edge(TOTAL, INVOICE, 'references')],
);
const BASE = graph(
  [
    node('pkg:@acme/api/billing', 'package'),
    node(LEGACY, 'file'),
    node(INVOICE, 'file'),
    node(TOTAL, 'symbol'),
  ],
  [edge(TOTAL, INVOICE, 'references'), edge(INVOICE, LEGACY, 'imports')],
);
const RESPONSE = {
  diff: {
    base: 'b',
    head: 'c',
    files: [],
    nodes: [{ id: LEGACY, status: 'removed' }],
    edges: [{ from: INVOICE, to: LEGACY, kind: 'imports', status: 'removed' }],
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
} as unknown as DiffResponse;

describe('exploreView', () => {
  it('in review mode keeps the removed file and the removed edge of the diff', () => {
    const { graph: g, marks } = exploreView('review', HEAD, BASE, RESPONSE);
    expect(g.nodes.map((n) => n.id)).toContain(LEGACY);
    expect(g.edges.map((e) => e.to)).toContain(LEGACY);
    expect(marks.get(LEGACY)?.status).toBe('removed');
  });

  it('in explore mode is the head alone: no legacyCoupon.ts, no removed edge, no mark', () => {
    const { graph: g, marks } = exploreView('explore', HEAD, BASE, RESPONSE);
    expect(g.nodes.map((n) => n.id)).toEqual([INVOICE, TOTAL]);
    expect(g.edges).toEqual([edge(TOTAL, INVOICE, 'references')]);
    expect(marks.size).toBe(0);
  });

  it('in explore mode needs neither the base nor the diff', () => {
    const { graph: g, marks } = exploreView('explore', HEAD, null, null);
    expect(g.nodes).toHaveLength(2);
    expect(marks.size).toBe(0);
  });
});

describe('entryPoints', () => {
  const entry = (id: string, type: string) =>
    node(id, 'symbol', { entry: true, entryType: type } as Partial<Node>);

  it('groups the entry points by type, routes first, nodes sorted by id', () => {
    const g = graph([
      entry(LIST, 'route'),
      entry(JOB, 'job'),
      entry(LOGIN, 'page'),
      entry(GET, 'route'),
      entry(CHECKOUT, 'page'),
      node(INVOICE, 'file'),
    ]);
    const groups = entryPoints(g).map((x) => ({ type: x.type, ids: x.nodes.map((n) => n.id) }));
    expect(groups).toEqual([
      { type: 'route', ids: [GET, LIST] },
      { type: 'page', ids: [CHECKOUT, LOGIN] },
      { type: 'job', ids: [JOB] },
    ]);
  });

  it('puts package.json scripts after the jobs and leaves empty groups out', () => {
    const g = graph([entry(START, 'script'), entry(JOB, 'job')]);
    expect(entryPoints(g).map((x) => x.type)).toEqual(['job', 'script']);
  });

  it('is empty when nothing is flagged', () => {
    expect(entryPoints(HEAD)).toEqual([]);
  });
});

describe('overview', () => {
  it('counts packages, externals, files, symbols and links by kind', () => {
    const response = {
      meta: { detector: 'pnpm-workspace' },
      graph: graph(
        [
          node('pkg:@acme/api', 'package'),
          node('pkg:@acme/db', 'package'),
          node('pkg:@acme/api/billing', 'module'),
          node('ext:fastify', 'external'),
          node(INVOICE, 'file'),
          node(LOGIN, 'file'),
          node(CHECKOUT, 'file'),
          node(TOTAL, 'symbol'),
          node(LIST, 'symbol'),
        ],
        [
          edge(INVOICE, LOGIN, 'imports'),
          edge(LOGIN, CHECKOUT, 'imports'),
          edge(TOTAL, LIST, 'calls'),
          edge(LIST, 'ext:fastify', 'depends_on'),
        ],
      ),
    } as unknown as SnapshotResponse;
    expect(overview(response)).toEqual({
      detector: 'pnpm-workspace',
      packages: 2,
      externals: 1,
      files: 3,
      symbols: 2,
      links: { imports: 2, calls: 1, depends_on: 1 },
    });
  });
});
