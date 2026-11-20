import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, ImpactedNode, ImpactResponse } from '../../../core/models/contract';
import { groupByDepth, impactMarks, serviceCount } from './impact.logic';

const SEED = 'pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh';
const SEED_SIBLING = 'pkg:@acme/api/auth::file:apps/api/auth/guard.ts::sym:requireAuth';
const BILLING = 'pkg:@acme/api/billing::file:apps/api/billing/checkout.ts::sym:postCheckout';
const BILLING_2 = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:renderInvoice';
const WEB = 'pkg:@acme/web/checkout::file:apps/web/checkout/page.ts::sym:CheckoutPage';

const hit = (node: string, depth: number): ImpactedNode =>
  ({
    node,
    depth,
    via: [SEED],
    kind: 'calls',
    tested: true,
    outOfDiff: false,
  }) as unknown as ImpactedNode;

describe('groupByDepth', () => {
  it('groups by depth, nearest first, keeping the order inside a group', () => {
    const groups = groupByDepth([
      hit(WEB, 3),
      hit(BILLING, 2),
      hit(SEED_SIBLING, 1),
      hit(BILLING_2, 2),
    ]);
    expect(groups.map((g) => g.depth)).toEqual([1, 2, 3]);
    expect(groups[1].nodes.map((n) => n.node)).toEqual([BILLING, BILLING_2]);
  });

  it('has no group for no result', () => {
    expect(groupByDepth([])).toEqual([]);
  });
});

describe('serviceCount', () => {
  it('counts the packages reached other than the seed one', () => {
    const reached = [hit(SEED_SIBLING, 1), hit(BILLING, 1), hit(BILLING_2, 2), hit(WEB, 3)];
    expect(serviceCount(reached)).toBe(2);
  });

  it('is 0 when everything stays in the seed package', () => {
    expect(serviceCount([hit(SEED_SIBLING, 1)])).toBe(0);
  });
});

describe('impactMarks', () => {
  const node = (id: string, parent: string | null) => ({ id, parent });
  const graph = {
    nodes: [
      node('pkg:@acme/api/billing', null),
      node('pkg:@acme/api/billing::file:apps/api/billing/checkout.ts', 'pkg:@acme/api/billing'),
      node(BILLING, 'pkg:@acme/api/billing::file:apps/api/billing/checkout.ts'),
      node('pkg:@acme/api/auth', null),
      node('pkg:@acme/api/auth::file:apps/api/auth/session.ts', 'pkg:@acme/api/auth'),
      node(SEED, 'pkg:@acme/api/auth::file:apps/api/auth/session.ts'),
    ],
    edges: [],
  } as unknown as GraphSnapshot;
  const response = { reached: [hit(BILLING, 1)] } as unknown as ImpactResponse;

  it('reaches the seed and the reached nodes', () => {
    const marks = impactMarks(graph, SEED, response);
    expect([...marks.reached].sort()).toEqual([BILLING, SEED].sort());
  });

  it('scopes the reached nodes and every box that contains one', () => {
    const marks = impactMarks(graph, SEED, response);
    expect(marks.scope.has('pkg:@acme/api/billing')).toBe(true);
    expect(marks.scope.has('pkg:@acme/api/billing::file:apps/api/billing/checkout.ts')).toBe(true);
    expect(marks.scope.has('pkg:@acme/api/auth')).toBe(true);
  });

  it('counts the reached nodes of a box, not the seed', () => {
    const marks = impactMarks(graph, SEED, response);
    expect(marks.counts.get('pkg:@acme/api/billing')).toBe(1);
    expect(marks.counts.get('pkg:@acme/api/billing::file:apps/api/billing/checkout.ts')).toBe(1);
    expect(marks.counts.has('pkg:@acme/api/auth')).toBe(false);
  });
});
