import type { Rule, Violation, ViolationEdge } from '../../../core/models/contract';

/** One row of the "Architecture rules" section. */
export interface RuleCounter<R extends { id: string } = Rule> {
  rule: R;
  introduced: number;
  existing: number;
  /** No violation at all. */
  respected: boolean;
}

/** Introduced and existing violations, counted or listed. */
export interface Split<T> {
  introduced: T;
  existing: T;
}

/** Introduced, existing and respected status of each rule, in the order of the rules. */
export function ruleCounters<R extends { id: string }>(
  rules: readonly R[],
  violations: readonly Violation[],
): RuleCounter<R>[] {
  return rules.map((rule) => {
    const own = violations.filter((v) => v.rule === rule.id);
    const introduced = own.filter((v) => v.introduced).length;
    const existing = own.length - introduced;
    return { rule, introduced, existing, respected: own.length === 0 };
  });
}

/** The edge to select for a rule: the first introduced violation, else the first existing one. */
export function faultyEdge(ruleId: string, violations: readonly Violation[]): ViolationEdge | null {
  const own = violations.filter((v) => v.rule === ruleId);
  return (own.find((v) => v.introduced) ?? own[0])?.edge ?? null;
}

/** Ids of the nodes that carry "archi": both ends of each violating edge (introduced only in review mode). */
export function archiNodes(violations: readonly Violation[], reviewMode: boolean): Set<string> {
  const ids = new Set<string>();
  for (const v of violations) {
    if (reviewMode && !v.introduced) continue;
    ids.add(v.edge.from);
    ids.add(v.edge.to);
  }
  return ids;
}

/** `ids` and all their ancestors, so the boxes holding a violating node carry the badge too. */
export function withAncestors(
  ids: ReadonlySet<string>,
  parentOf: (id: string) => string | null | undefined,
): Set<string> {
  const all = new Set<string>();
  for (const id of ids) {
    for (let cur: string | null | undefined = id; cur && !all.has(cur); cur = parentOf(cur)) {
      all.add(cur);
    }
  }
  return all;
}

const sameEdge = (a: ViolationEdge, b: ViolationEdge) =>
  a.from === b.from && a.to === b.to && a.kind === b.kind;

/** The violations whose edge is one of the fine `links` of an aggregated edge. */
export function linkViolations(
  links: readonly ViolationEdge[],
  violations: readonly Violation[],
): Violation[] {
  return violations.filter((v) => links.some((link) => sameEdge(link, v.edge)));
}

/** How many fine links of an aggregated edge are violating edges (introduced is the "warning n"). */
export function edgeViolations(
  links: readonly ViolationEdge[],
  violations: readonly Violation[],
): Split<number> {
  const { introduced, existing } = splitViolations(linkViolations(links, violations));
  return { introduced: introduced.length, existing: existing.length };
}

/** Introduced violations first, existing ones apart, each in their order. */
export function splitViolations(violations: readonly Violation[]): Split<Violation[]> {
  return {
    introduced: violations.filter((v) => v.introduced),
    existing: violations.filter((v) => !v.introduced),
  };
}

/** The violations that touch a node or one of its descendants (ids nest by prefix). */
export function nodeViolations(nodeId: string, violations: readonly Violation[]): Violation[] {
  const within = (id: string) => id === nodeId || id.startsWith(`${nodeId}::`);
  return violations.filter((v) => within(v.edge.from) || within(v.edge.to));
}

/** The base side of a range (`main...feat/x` gives `main`); null when it is not readable. */
export function baseOfRange(range: string | null): string | null {
  if (!range) return null;
  const base = range.split(/\.{2,3}/)[0];
  return base || null;
}
