import { describe, expect, it } from 'vitest';

import type { Edge, EdgeKind } from '../../../core/models/contract';
import {
  aggregateEdges,
  edgeLabel,
  edgeLabelVisible,
  edgeThickness,
  edgeShape,
  edgeTooltip,
  filterEdges,
  type AggregatedEdge,
} from './edges.logic';

function edge(from: string, to: string, kind: EdgeKind = 'calls'): Edge {
  return { from, to, kind, precision: 'resolved' };
}

const WEB = 'pkg:@acme/web';
const WEB_FILE = `${WEB}::file:components/Promo.tsx`;
const WEB_SYM = `${WEB_FILE}::sym:validateCodeLocally`;
const WEB_SYM2 = `${WEB_FILE}::sym:PromoCodeInput`;
const API = 'pkg:@acme/api';
const API_FILE = `${API}::file:routes/checkout.ts`;
const API_SYM = `${API_FILE}::sym:checkout`;
const DB = 'pkg:@acme/db';
const DB_FILE = `${DB}::file:repos/discountRepo.ts`;
const DB_SYM = `${DB_FILE}::sym:findDiscountByCode`;
const DB_SYM2 = `${DB_FILE}::sym:createDiscount`;

const PARENTS = new Map<string, string | null>([
  ['pkg:acme', null],
  [WEB, 'pkg:acme'],
  [WEB_FILE, WEB],
  [WEB_SYM, WEB_FILE],
  [WEB_SYM2, WEB_FILE],
  [API, 'pkg:acme'],
  [API_FILE, API],
  [API_SYM, API_FILE],
  [DB, 'pkg:acme'],
  [DB_FILE, DB],
  [DB_SYM, DB_FILE],
  [DB_SYM2, DB_FILE],
]);

const EDGES: Edge[] = [
  edge(WEB_SYM, DB_SYM),
  edge(WEB_SYM2, DB_SYM2),
  edge(WEB_SYM2, WEB_SYM), // internal to web
  edge(API_SYM, DB_SYM),
  edge(WEB_SYM, API_SYM, 'http'),
  edge(WEB_FILE, WEB_SYM, 'references'), // ancestor / descendant
];

const SYSTEM_LEVEL = new Set([WEB, API, DB]);
const SYMBOL_LEVEL = new Set([WEB_SYM, WEB_SYM2, API_SYM, DB_SYM, DB_SYM2]);

function pair(edges: AggregatedEdge[], from: string, to: string): AggregatedEdge | undefined {
  return edges.find((e) => e.from === from && e.to === to);
}

describe('aggregateEdges', () => {
  it('attaches fine edges to the visible systems and counts the links per ordered pair', () => {
    const edges = aggregateEdges(EDGES, PARENTS, SYSTEM_LEVEL);
    expect(edges).toHaveLength(3);
    expect(pair(edges, WEB, DB)?.count).toBe(2);
    expect(pair(edges, API, DB)?.count).toBe(1);
    expect(pair(edges, WEB, API)?.count).toBe(1);
  });

  it('ignores internal edges and ancestor/descendant edges', () => {
    const edges = aggregateEdges(EDGES, PARENTS, SYSTEM_LEVEL);
    expect(edges.some((e) => e.from === e.to)).toBe(false);
    const total = edges.reduce((sum, e) => sum + e.count, 0);
    expect(total).toBe(4);
    const nested = aggregateEdges(EDGES, PARENTS, new Set([WEB, WEB_FILE, WEB_SYM, API, DB]));
    expect(nested.some((e) => e.from === WEB_FILE && e.to === WEB_SYM)).toBe(false);
  });

  it('collects the distinct kinds of a pair', () => {
    const edges = aggregateEdges(
      [edge(WEB_SYM, DB_SYM, 'calls'), edge(WEB_SYM2, DB_SYM2, 'imports'), edge(WEB_SYM, DB_SYM2)],
      PARENTS,
      SYSTEM_LEVEL,
    );
    const web = pair(edges, WEB, DB);
    expect(web?.count).toBe(3);
    expect([...(web?.kinds ?? [])].sort()).toEqual(['calls', 'imports']);
  });

  it('keeps the fine links of each pair', () => {
    const web = pair(aggregateEdges(EDGES, PARENTS, SYSTEM_LEVEL), WEB, DB);
    expect(web?.links).toEqual([edge(WEB_SYM, DB_SYM), edge(WEB_SYM2, DB_SYM2)]);
  });

  it('does not merge the two directions of a pair', () => {
    const edges = aggregateEdges(
      [edge(WEB_SYM, DB_SYM), edge(DB_SYM, WEB_SYM)],
      PARENTS,
      SYSTEM_LEVEL,
    );
    expect(pair(edges, WEB, DB)?.count).toBe(1);
    expect(pair(edges, DB, WEB)?.count).toBe(1);
  });

  it('re-aggregates at a deeper visibility: one edge per pair of symbols', () => {
    const edges = aggregateEdges(EDGES, PARENTS, SYMBOL_LEVEL);
    expect(pair(edges, WEB_SYM, DB_SYM)?.count).toBe(1);
    expect(pair(edges, WEB_SYM2, DB_SYM2)?.count).toBe(1);
    expect(pair(edges, API_SYM, DB_SYM)?.count).toBe(1);
    expect(pair(edges, WEB_SYM, API_SYM)?.count).toBe(1);
    expect(pair(edges, WEB_SYM2, WEB_SYM)?.count).toBe(1);
    expect(edges).toHaveLength(6 - 1); // the file -> symbol edge has no visible file
  });

  it('drops an edge whose end has no visible ancestor', () => {
    expect(aggregateEdges([edge(WEB_SYM, DB_SYM)], PARENTS, new Set([WEB]))).toEqual([]);
  });

  it('marks a pair as changed when one of its links is', () => {
    const changed = (e: Edge) => e.from === WEB_SYM2;
    const edges = aggregateEdges(EDGES, PARENTS, SYSTEM_LEVEL, { changed });
    expect(pair(edges, WEB, DB)?.changed).toBe(true);
    expect(pair(edges, API, DB)?.changed).toBe(false);
  });
});

describe('filterEdges', () => {
  const edges = aggregateEdges(EDGES, PARENTS, SYSTEM_LEVEL, {
    changed: (e) => e.from === WEB_SYM2,
  });

  it('keeps everything when the unchanged layer is shown', () => {
    expect(filterEdges(edges, true)).toHaveLength(3);
  });

  it('keeps only the changed pairs when the unchanged layer is hidden', () => {
    const kept = filterEdges(edges, false);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.from).toBe(WEB);
    expect(kept[0]?.to).toBe(DB);
  });
});

describe('edgeThickness', () => {
  it('is positive and grows with the number of links', () => {
    expect(edgeThickness(1)).toBeGreaterThan(0);
    expect(edgeThickness(5)).toBeGreaterThan(edgeThickness(1));
    expect(edgeThickness(20)).toBeGreaterThanOrEqual(edgeThickness(5));
  });

  it('follows the mockup, 1.3 + 0.9 * log2(n)', () => {
    expect(edgeThickness(1)).toBeCloseTo(1.3, 5);
    expect(edgeThickness(2)).toBeCloseTo(2.2, 5);
    expect(edgeThickness(4)).toBeCloseTo(3.1, 5);
  });

  it('stays bounded for huge counts', () => {
    expect(edgeThickness(10_000)).toBeLessThan(40);
  });
});

describe('edgeTooltip', () => {
  const label = (id: string) => (id === WEB ? 'apps/web' : 'apps/api');

  it('names both ends, the number of links and the kinds', () => {
    const tip = edgeTooltip({ from: WEB, to: API, count: 3, kinds: ['http'] }, label);
    expect(tip).toContain('apps/web → apps/api · 3');
    expect(tip).toContain('(HTTP)');
  });

  it('lists several kinds', () => {
    const tip = edgeTooltip({ from: WEB, to: API, count: 2, kinds: ['calls', 'imports'] }, label);
    expect(tip).toContain('calls');
    expect(tip).toContain('imports');
  });
});

describe('edgeShape count label', () => {
  // Two 40x40 boxes 320 px apart: the curve runs (40,20) -> (360,20) bent through (200, 77.6).
  const A = { x: 0, y: 0, w: 40, h: 40 };
  const B = { x: 360, y: 0, w: 40, h: 40 };

  it('sits mid-curve when nothing is to avoid', () => {
    const shape = edgeShape(A, B);
    expect(shape.mx).toBeCloseTo(200, 3);
    expect(shape.my).toBeCloseTo(48.8, 3);
    expect(shape.covered).toBe(false);
  });

  it('slides along the curve out of a box under the default position', () => {
    const shape = edgeShape(A, B, [{ x: 170, y: 30, w: 60, h: 40 }]);
    expect(shape.mx).toBeCloseTo(136, 3);
    expect(shape.my).toBeCloseTo(44.192, 3);
    expect(shape.covered).toBe(false);
  });

  it('is covered when boxes hide the whole curve', () => {
    const shape = edgeShape(A, B, [{ x: 0, y: -100, w: 400, h: 300 }]);
    expect(shape.covered).toBe(true);
  });
});

describe('edgeLabel', () => {
  const EN = { new: 'new', moved: 'moved' };
  const FR = { new: 'nouveau', moved: 'déplacé' };
  const base = { count: 1, added: 0, removed: 0, moved: 0, cls: 'base' as const, review: false };

  it('writes nothing for an edge of a single link without diff', () => {
    expect(edgeLabel(base, EN)).toBe('');
  });

  it('writes the number of links from two up', () => {
    expect(edgeLabel({ ...base, count: 5 }, EN)).toBe('5');
    expect(edgeLabel({ ...base, count: 2 }, EN)).toBe('2');
  });

  it('adds the added and removed links while reviewing', () => {
    expect(edgeLabel({ ...base, count: 3, added: 1, review: true }, EN)).toBe('3 +1');
    expect(edgeLabel({ ...base, count: 3, added: 1, removed: 1, review: true }, EN)).toBe(
      '2 +1 \u22121',
    );
  });

  it('does not add them outside review', () => {
    expect(edgeLabel({ ...base, count: 3, added: 1 }, EN)).toBe('3');
  });

  it('calls an added edge of one link new, in the language given', () => {
    const added = { ...base, count: 1, added: 1, cls: 'add' as const, review: true };
    expect(edgeLabel(added, EN)).toBe('new');
    expect(edgeLabel(added, FR)).toBe('nouveau');
  });

  it('counts the links of an added edge of several links', () => {
    expect(edgeLabel({ ...base, count: 3, added: 3, cls: 'add', review: true }, EN)).toBe('+3');
  });

  it('counts the removed links of a removed edge with a minus sign', () => {
    expect(edgeLabel({ ...base, count: 2, removed: 2, cls: 'del', review: true }, EN)).toBe(
      '\u22122',
    );
  });

  it('says moved for a moved edge', () => {
    expect(edgeLabel({ ...base, moved: 1, cls: 'mov', review: true }, EN)).toBe('moved');
    expect(edgeLabel({ ...base, moved: 1, cls: 'mov', review: true }, FR)).toBe('déplacé');
  });

  it('warns with the number of links for a violating edge', () => {
    expect(edgeLabel({ ...base, count: 4, cls: 'viol' }, EN)).toBe('\u26a0 4');
    expect(edgeLabel({ ...base, count: 4, cls: 'violOld' }, EN)).toBe('\u26a0 4');
  });
});

describe('edgeLabelVisible', () => {
  it('hides an empty label', () => {
    expect(edgeLabelVisible('', 300)).toBe(false);
  });

  it('hides the label of an edge shorter than 60 px on screen', () => {
    expect(edgeLabelVisible('5', 50)).toBe(false);
    expect(edgeLabelVisible('5', 60)).toBe(false);
  });

  it('shows the label of a longer edge', () => {
    expect(edgeLabelVisible('5', 61)).toBe(true);
  });
});

describe('edgeShape length', () => {
  it('reports the on-screen distance between the two borders', () => {
    const a = { x: 0, y: 0, w: 100, h: 40 };
    const b = { x: 400, y: 0, w: 100, h: 40 };
    const { length } = edgeShape(a, b);
    expect(length).toBeGreaterThanOrEqual(300);
    expect(length).toBeLessThan(320);
  });
});

describe('edgeShape in world units at a scale', () => {
  // On screen (scale 1): a = 200x100 at the origin, b = 200x100 at x = 600. At scale 2 the same
  // boxes are, in the world, 100x50 at the origin and at x = 300.
  const A = { x: 0, y: 0, w: 100, h: 50 };
  const B = { x: 300, y: 0, w: 100, h: 50 };
  const numbers = (path: string): number[] => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('is the screen shape mapped back to the world', () => {
    const shape = edgeShape(A, B, [], 2);
    expect(shape.d).toBe('M100,25Q200,55 300,25');
    expect(shape.mx).toBeCloseTo(200, 6);
    expect(shape.my).toBeCloseTo(40, 6);
    expect(shape.covered).toBe(false);
  });

  it('keeps the arrow head 9 x 8 screen pixels, so smaller in the world', () => {
    const [x0, y0, x1, y1, x2, y2] = numbers(edgeShape(A, B, [], 2).arrow);
    expect([x0, y0]).toEqual([300, 25]);
    expect(x1).toBeCloseTo(296.2644775, 5);
    expect(y1).toBeCloseTo(28.2087181, 5);
    expect(x2).toBeCloseTo(295.1150859, 5);
    expect(y2).toBeCloseTo(24.3774129, 5);
  });

  it('caps the bend at 60 screen pixels, so 30 world units at scale 2', () => {
    const far = { x: 500, y: 0, w: 100, h: 50 };
    expect(edgeShape(A, far, [], 2).d).toBe('M100,25Q300,55 500,25');
  });

  it('slides the label off a box by its size in screen pixels', () => {
    // The label is 28 x 16 px: 14 x 8 world units at scale 2, hence free at t = 0.4 here.
    const shape = edgeShape(A, B, [{ x: 190, y: 30, w: 20, h: 20 }], 2);
    expect(shape.mx).toBeCloseTo(180, 6);
    expect(shape.my).toBeCloseTo(39.4, 6);
    expect(shape.covered).toBe(false);
  });

  it('measures the length in screen pixels', () => {
    expect(edgeShape(A, B, [], 2).length).toBeCloseTo(400, 6);
    expect(edgeShape(A, B).length).toBeCloseTo(200, 6);
  });
});
