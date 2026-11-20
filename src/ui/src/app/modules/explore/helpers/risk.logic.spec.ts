import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, Metrics, Node } from '../../../core/models/contract';
import { hotspots, rawRisk, riskLevel, riskMap } from './risk.logic';

// Expected API (risk.logic.ts, pure), fed with the answer of `metrics` (node id -> Metrics, the
// contract gains `churn?: number`, `owner?: string`, `tested?: boolean` next to `complexity?`):
//  - rawRisk(m) = (complexity ?? 1) x churn x (tested ? 1 : 2); 0 without churn;
//  - riskMap(graph, metrics): Map id -> risk in [0, 1] = rawRisk / the largest rawRisk among the
//    symbols; a symbol without metrics has 0; a container (file, module, package) takes the max of
//    its descendants;
//  - hotspots(graph, metrics, limit = 6): the symbols with a risk above 0, by decreasing risk then
//    by id, at most `limit`, as { id, risk };
//  - riskLevel(risk): the tint step 0..4 = ceil(risk x 4) (0 stays 0).
const PKG = 'pkg:p';
const MOD = 'pkg:p/src';
const F1 = 'pkg:p/src::file:src/a.ts';
const F2 = 'pkg:p/src::file:src/b.ts';
const sym = (file: string, name: string) => `${file}::sym:${name}`;

function node(id: string, kind: Node['kind'], parent: string | null): Node {
  return { id, kind, subkind: 'x', parent, visibility: 'public', contentHash: 'h' };
}
function m(complexity: number | undefined, churn: number, tested: boolean): Metrics {
  return { loc: 10, complexity, churn, tested } as Metrics;
}

const GRAPH: GraphSnapshot = {
  commit: 'c',
  edges: [],
  nodes: [
    node(PKG, 'package', null),
    node(MOD, 'package', PKG),
    node(F1, 'file', MOD),
    node(F2, 'file', MOD),
    ...['a', 'b', 'c', 'd', 'e'].map((s) => node(sym(F1, s), 'symbol', F1)),
    node(sym(F2, 'f'), 'symbol', F2),
  ],
};
const METRICS: Record<string, Metrics> = {
  [sym(F1, 'a')]: m(4, 5, false), // 4 x 5 x 2 = 40
  [sym(F1, 'b')]: m(2, 5, true), // 10
  [sym(F1, 'c')]: m(10, 2, false), // 40
  [sym(F1, 'd')]: m(1, 0, false), // 0
  [sym(F1, 'e')]: m(3, 1, true), // 3
  [sym(F2, 'f')]: m(undefined, 3, true), // 3
};

describe('rawRisk', () => {
  it('multiplies complexity, churn and the absence of tests', () => {
    expect(rawRisk(m(4, 5, false))).toBe(40);
    expect(rawRisk(m(2, 5, true))).toBe(10);
  });

  it('treats a missing complexity as 1 and a missing churn as no risk', () => {
    expect(rawRisk(m(undefined, 3, true))).toBe(3);
    expect(rawRisk(m(9, 0, false))).toBe(0);
    expect(rawRisk({ loc: 3 } as Metrics)).toBe(0);
  });
});

describe('riskMap', () => {
  const risk = riskMap(GRAPH, METRICS);

  it('normalises the symbols by the largest raw risk (40)', () => {
    expect(risk.get(sym(F1, 'a'))).toBe(1);
    expect(risk.get(sym(F1, 'c'))).toBe(1);
    expect(risk.get(sym(F1, 'b'))).toBe(0.25);
    expect(risk.get(sym(F1, 'e'))).toBe(0.075);
    expect(risk.get(sym(F1, 'd'))).toBe(0);
  });

  it('gives a container the max of its descendants', () => {
    expect(risk.get(F1)).toBe(1);
    expect(risk.get(F2)).toBe(0.075);
    expect(risk.get(MOD)).toBe(1);
    expect(risk.get(PKG)).toBe(1);
  });

  it('is empty-safe: no metrics means a risk of 0 everywhere', () => {
    const none = riskMap(GRAPH, {});
    expect(none.get(F1)).toBe(0);
    expect(none.get(sym(F1, 'a'))).toBe(0);
  });
});

describe('hotspots', () => {
  it('lists the riskiest symbols first, ties by id, without the zero-risk ones', () => {
    expect(hotspots(GRAPH, METRICS)).toEqual([
      { id: sym(F1, 'a'), risk: 1 },
      { id: sym(F1, 'c'), risk: 1 },
      { id: sym(F1, 'b'), risk: 0.25 },
      { id: sym(F1, 'e'), risk: 0.075 },
      { id: sym(F2, 'f'), risk: 0.075 },
    ]);
  });

  it('keeps the top 6 by default and honours a limit', () => {
    const nodes = [node(F1, 'file', null)];
    const metrics: Record<string, Metrics> = {};
    for (let i = 1; i <= 9; i++) {
      nodes.push(node(sym(F1, `s${i}`), 'symbol', F1));
      metrics[sym(F1, `s${i}`)] = m(1, i, true);
    }
    const graph: GraphSnapshot = { commit: 'c', edges: [], nodes };
    expect(hotspots(graph, metrics).map((h) => h.id)).toEqual(
      [9, 8, 7, 6, 5, 4].map((i) => sym(F1, `s${i}`)),
    );
    expect(hotspots(graph, metrics, 2)).toHaveLength(2);
  });
});

describe('riskLevel', () => {
  it('maps a risk to a tint step from 0 to 4', () => {
    expect(riskLevel(0)).toBe(0);
    expect(riskLevel(0.075)).toBe(1);
    expect(riskLevel(0.25)).toBe(1);
    expect(riskLevel(0.26)).toBe(2);
    expect(riskLevel(0.5)).toBe(2);
    expect(riskLevel(0.51)).toBe(3);
    expect(riskLevel(0.75)).toBe(3);
    expect(riskLevel(0.76)).toBe(4);
    expect(riskLevel(1)).toBe(4);
  });
});
