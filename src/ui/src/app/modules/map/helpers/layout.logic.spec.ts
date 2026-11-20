import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { layoutGraph } from './layout.logic';

function node(id: string, kind: NodeKind, parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}

function graph(nodes: Node[]): GraphSnapshot {
  return { commit: '0123456789abcdef0123456789abcdef01234567', edges: [], nodes };
}

const API = 'pkg:@acme/api';
const BILLING = `${API}::mod:billing`;
const INVOICE = `${API}::file:billing/invoice.ts`;
const PAYMENT = `${API}::file:billing/payment.ts`;

// repo > service > module > 2 files (2 symbols in the first, 1 in the second)
const SNAPSHOT = graph([
  node('pkg:acme', 'repo', null),
  node(API, 'service', 'pkg:acme'),
  node(BILLING, 'module', API),
  node(INVOICE, 'file', BILLING),
  node(`${INVOICE}::sym:computeTotal`, 'symbol', INVOICE),
  node(`${INVOICE}::sym:applyDiscount`, 'symbol', INVOICE),
  node(PAYMENT, 'file', BILLING),
  node(`${PAYMENT}::sym:chargeCustomer`, 'symbol', PAYMENT),
  node('pkg:external', 'module', 'pkg:acme'),
  node('pkg:external/stripe-sdk', 'external', 'pkg:external'),
]);

describe('layoutGraph', () => {
  const layout = layoutGraph(SNAPSHOT);
  const at = (id: string) => {
    const n = layout.nodes.get(id);
    if (!n) throw new Error(`no node ${id}`);
    return n;
  };

  it('does not lay out the repo root: its children are the roots of the map', () => {
    expect(layout.nodes.has('pkg:acme')).toBe(false);
    expect(layout.roots).toEqual([API, 'pkg:external']);
  });

  it('sizes a symbol 210x26 and an external 240x110', () => {
    expect(at(`${INVOICE}::sym:computeTotal`)).toMatchObject({ w: 210, h: 26 });
    expect(at('pkg:external/stripe-sdk')).toMatchObject({ w: 240, h: 110 });
  });

  it('stacks symbols in one column inside a file (padding 8, header 30, gap 5)', () => {
    expect(at(INVOICE)).toMatchObject({ w: 226, h: 95 });
    expect(at(PAYMENT)).toMatchObject({ w: 226, h: 64 });
    const file = at(INVOICE);
    const first = at(`${INVOICE}::sym:computeTotal`);
    const second = at(`${INVOICE}::sym:applyDiscount`);
    expect(first.x).toBe(file.x + 8);
    expect(first.y).toBe(file.y + 30);
    expect(second.x).toBe(file.x + 8);
    expect(second.y).toBe(file.y + 30 + 26 + 5);
  });

  it('arranges children on a ceil(sqrt(n))-column grid (module: padding 14, header 36, gap 16)', () => {
    const module = at(BILLING);
    const first = at(INVOICE);
    const second = at(PAYMENT);
    expect(first.x).toBe(module.x + 14);
    expect(first.y).toBe(module.y + 36);
    expect(second.x).toBe(module.x + 14 + 226 + 16);
    expect(second.y).toBe(module.y + 36);
    expect(module).toMatchObject({ w: 14 + 226 + 16 + 226 + 14, h: 36 + 95 + 14 });
  });

  it('sizes a system around its modules (padding 22, header 50)', () => {
    const system = at(API);
    expect(system).toMatchObject({ w: 22 + 496 + 22, h: 50 + 145 + 22 });
    expect(at(BILLING).x).toBe(system.x + 22);
    expect(at(BILLING).y).toBe(system.y + 50);
  });

  it('records parent and ordered children on each node', () => {
    expect(at(BILLING).parent).toBe(API);
    expect(at(BILLING).children).toEqual([INVOICE, PAYMENT]);
    expect(at(API).kind).toBe('service');
  });

  it('keeps every child inside its parent and the roots apart', () => {
    for (const n of layout.nodes.values()) {
      if (n.parent === null || !layout.nodes.has(n.parent)) continue;
      const p = at(n.parent);
      expect(n.x).toBeGreaterThanOrEqual(p.x);
      expect(n.y).toBeGreaterThanOrEqual(p.y);
      expect(n.x + n.w).toBeLessThanOrEqual(p.x + p.w);
      expect(n.y + n.h).toBeLessThanOrEqual(p.y + p.h);
    }
    const [a, b] = layout.roots.map(at);
    const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
    expect(apart).toBe(true);
  });

  it('exposes bounds that contain every root', () => {
    for (const id of layout.roots) {
      const r = at(id);
      expect(r.x).toBeGreaterThanOrEqual(layout.bounds.x);
      expect(r.y).toBeGreaterThanOrEqual(layout.bounds.y);
      expect(r.x + r.w).toBeLessThanOrEqual(layout.bounds.x + layout.bounds.w);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.bounds.y + layout.bounds.h);
    }
  });

  it('gives an empty graph an empty layout', () => {
    expect(layoutGraph(graph([])).roots).toEqual([]);
  });
});
