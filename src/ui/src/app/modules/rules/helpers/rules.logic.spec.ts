import { describe, expect, it } from 'vitest';

import type { Violation } from '../../../core/models/contract';
import {
  edgeViolations,
  faultyEdge,
  archiNodes,
  ruleCounters,
  splitViolations,
} from './rules.logic';

// Expected API (rules.logic.ts, pure):
//  - ruleCounters(rules, violations): one row per rule, in the order of `rules`:
//    { rule, introduced, existing, respected } (respected = no violation at all);
//  - faultyEdge(ruleId, violations): the edge to select for a rule: the first introduced
//    violation, else the first existing one, else null;
//  - archiNodes(violations, reviewMode): ids of the nodes carrying "archi" (both ends of each
//    violating edge); in review mode only the introduced violations count, outside it all do;
//  - edgeViolations(links, violations): { introduced, existing } = how many of the fine links of an
//    aggregated edge are violating edges (the "warning n" of the edge is `introduced`);
//  - splitViolations(violations): { introduced, existing }, order kept.
const WEB_RULE = {
  id: 'web-sans-db',
  description: 'd',
  from: 'apps/web/**',
  deny: 'packages/db/**',
};
const PKG_RULE = {
  id: 'packages-sans-apps',
  description: 'd',
  from: 'packages/**',
  deny: 'apps/**',
};
const ROUTES_RULE = {
  id: 'routes-via-repos',
  description: 'd',
  from: 'apps/api/routes/**',
  deny: 'packages/db/schema/**',
};
const RULES = [WEB_RULE, PKG_RULE, ROUTES_RULE].map((r) => ({
  ...r,
  kinds: ['imports', 'calls', 'references', 'renders'],
}));

const VALIDATE = 'pkg:@acme/web/checkout::file:apps/web/checkout/codes.ts::sym:validateCodeLocally';
const FIND = 'pkg:@acme/db/repos::file:packages/db/repos/discounts.ts::sym:findDiscountByCode';
const LIST = 'pkg:@acme/api/routes::file:apps/api/routes/invoices.ts::sym:listInvoices';
const TABLE = 'pkg:@acme/db/schema::file:packages/db/schema/tables.ts::sym:invoicesTable';
const OTHER = 'pkg:@acme/web/x::file:apps/web/x.ts::sym:other';

const INTRODUCED: Violation = {
  rule: 'web-sans-db',
  edge: { from: VALIDATE, to: FIND, kind: 'calls' },
  introduced: true,
};
const EXISTING: Violation = {
  rule: 'routes-via-repos',
  edge: { from: LIST, to: TABLE, kind: 'references' },
  introduced: false,
};

describe('ruleCounters', () => {
  it('counts introduced, existing and respected per rule, in the order of the rules', () => {
    const rows = ruleCounters(RULES, [INTRODUCED, EXISTING]);

    expect(rows.map((r) => [r.rule.id, r.introduced, r.existing, r.respected])).toEqual([
      ['web-sans-db', 1, 0, false],
      ['packages-sans-apps', 0, 0, true],
      ['routes-via-repos', 0, 1, false],
    ]);
  });

  it('counts several violations of the same rule by status', () => {
    const second: Violation = {
      ...INTRODUCED,
      edge: { from: VALIDATE, to: FIND, kind: 'references' },
    };
    const old: Violation = { ...INTRODUCED, introduced: false };

    const [row] = ruleCounters(RULES, [INTRODUCED, second, old]);

    expect([row.introduced, row.existing, row.respected]).toEqual([2, 1, false]);
  });

  it('ignores violations of an unknown rule and respects everything without violations', () => {
    const rows = ruleCounters(RULES, [{ ...EXISTING, rule: 'gone' }]);

    expect(rows.every((r) => r.respected && r.introduced === 0 && r.existing === 0)).toBe(true);
    expect(ruleCounters([], [INTRODUCED])).toEqual([]);
  });
});

describe('faultyEdge', () => {
  it('returns the edge of the violation of the rule', () => {
    expect(faultyEdge('routes-via-repos', [INTRODUCED, EXISTING])).toEqual(EXISTING.edge);
  });

  it('prefers an introduced violation over an existing one', () => {
    const old: Violation = {
      ...INTRODUCED,
      introduced: false,
      edge: { ...INTRODUCED.edge, to: TABLE },
    };

    expect(faultyEdge('web-sans-db', [old, INTRODUCED])).toEqual(INTRODUCED.edge);
  });

  it('is null for a respected or unknown rule', () => {
    expect(faultyEdge('packages-sans-apps', [INTRODUCED, EXISTING])).toBeNull();
    expect(faultyEdge('nope', [])).toBeNull();
  });
});

describe('archiNodes', () => {
  it('in review mode only the introduced violations mark their two ends', () => {
    expect([...archiNodes([INTRODUCED, EXISTING], true)].sort()).toEqual([FIND, VALIDATE].sort());
  });

  it('outside review mode every violation marks its two ends', () => {
    expect([...archiNodes([INTRODUCED, EXISTING], false)].sort()).toEqual(
      [FIND, VALIDATE, LIST, TABLE].sort(),
    );
  });

  it('is empty without violations', () => {
    expect(archiNodes([], true).size).toBe(0);
    expect(archiNodes([EXISTING], true).size).toBe(0);
  });
});

describe('edgeViolations', () => {
  const link = (from: string, to: string, kind: 'calls' | 'references' = 'calls') => ({
    from,
    to,
    kind,
    precision: 'exact' as const,
  });

  it('counts the introduced and existing violating links of an aggregated edge', () => {
    const links = [link(VALIDATE, FIND), link(OTHER, FIND), link(LIST, TABLE, 'references')];

    expect(edgeViolations(links, [INTRODUCED, EXISTING])).toEqual({ introduced: 1, existing: 1 });
  });

  it('does not match a link of the same ends but another kind', () => {
    expect(edgeViolations([link(VALIDATE, FIND, 'references')], [INTRODUCED])).toEqual({
      introduced: 0,
      existing: 0,
    });
  });

  it('is zero without violations', () => {
    expect(edgeViolations([link(VALIDATE, FIND)], [])).toEqual({ introduced: 0, existing: 0 });
  });
});

describe('splitViolations', () => {
  it('puts the introduced ones first and the existing ones apart, keeping their order', () => {
    const old2: Violation = { ...EXISTING, rule: 'web-sans-db' };

    const { introduced, existing } = splitViolations([EXISTING, INTRODUCED, old2]);

    expect(introduced).toEqual([INTRODUCED]);
    expect(existing).toEqual([EXISTING, old2]);
  });
});
