import type { Edge } from '../../../core/models/contract';
import {
  firstVisible,
  foldSymbolEnd,
  isUnfoldedEdge,
  type AggregatedEdge,
  type AggregateOptions,
} from './edges.logic';

export interface EdgeAggregator {
  /** The aggregated edges for these visible boxes; only the pairs under a changed box are rebuilt. */
  update(visible: Set<string>, unfolded?: ReadonlySet<string>): AggregatedEdge[];
}

interface Pair {
  from: string;
  to: string;
  /** Indexes (in `edges`) of the fine edges attached to the pair. */
  members: Set<number>;
  value: AggregatedEdge | null;
  /** The smallest index of the members: pairs come in the order of their first edge. */
  first: number;
}

/** `isAncestor` without allocation. */
function above(
  ancestor: string,
  id: string,
  parents: Map<string, string | null>,
  budget: number,
): boolean {
  let cur = parents.get(id);
  for (let n = 0; cur && n <= budget; n++, cur = parents.get(cur)) {
    if (cur === ancestor) return true;
  }
  return false;
}

/**
 * Same result as `aggregateEdges`, kept from one visibility to the next: only the fine edges
 * with an end under a box whose visibility changed are attached again.
 */
export function createEdgeAggregator(
  edges: Edge[],
  parents: Map<string, string | null>,
  opts: AggregateOptions = {},
): EdgeAggregator {
  // Pairs by `from` then `to`, (the order of the result is `ordered`).
  const pairs = new Map<string, Map<string, Pair>>();
  const budget = parents.size + 1;
  const attached: Array<Pair | null> = new Array<Pair | null>(edges.length).fill(null);
  const changedMemo = new Map<number, boolean>();
  let previous: Set<string> | null = null;
  let previousUnfolded: ReadonlySet<string> = new Set();
  // The pairs in the order of `aggregateEdges`, sorted again only when a pair was touched.
  let ordered: Pair[] = [];
  // The array last returned, given again while no pair is touched.
  let result: AggregatedEdge[] | null = null;
  // Fine edges with an end at or under each node, built when first needed.
  let under: Map<string, number[]> | null = null;

  const isChanged = (i: number): boolean => {
    let value = changedMemo.get(i);
    if (value === undefined) {
      value = opts.changed?.(edges[i]) ?? false;
      changedMemo.set(i, value);
    }
    return value;
  };

  const buildUnder = (): Map<string, number[]> => {
    const index = new Map<string, number[]>();
    const add = (id: string, i: number): void => {
      const seen = new Set<string>();
      for (let cur: string | null | undefined = id; cur && !seen.has(cur); cur = parents.get(cur)) {
        seen.add(cur);
        const list = index.get(cur);
        if (!list) index.set(cur, [i]);
        else if (list[list.length - 1] !== i) list.push(i);
      }
    };
    edges.forEach((edge, i) => {
      add(edge.from, i);
      add(edge.to, i);
    });
    return index;
  };

  const attach = (
    i: number,
    visible: Set<string>,
    unfolded: ReadonlySet<string>,
    touched: Set<Pair>,
  ): void => {
    const edge = edges[i];
    let target: Pair | null = null;
    let from = firstVisible(edge.from, parents, visible, budget);
    let to = firstVisible(edge.to, parents, visible, budget);
    if (opts.isSymbol && !isUnfoldedEdge(edge, parents, unfolded, budget)) {
      from = foldSymbolEnd(from, parents, visible, opts.isSymbol, budget);
      to = foldSymbolEnd(to, parents, visible, opts.isSymbol, budget);
    }
    if (
      from &&
      to &&
      from !== to &&
      !above(from, to, parents, budget) &&
      !above(to, from, parents, budget)
    ) {
      let row = pairs.get(from);
      if (!row) {
        row = new Map();
        pairs.set(from, row);
      }
      target = row.get(to) ?? null;
      if (!target) {
        target = { from, to, members: new Set(), value: null, first: 0 };
        row.set(to, target);
      }
    }
    const old = attached[i];
    if (old === target) return;
    if (old) {
      old.members.delete(i);
      touched.add(old);
    }
    attached[i] = target;
    if (target) {
      target.members.add(i);
      touched.add(target);
    }
  };

  const build = (pair: Pair): AggregatedEdge => {
    const value: AggregatedEdge = {
      from: pair.from,
      to: pair.to,
      count: 0,
      kinds: [],
      links: [],
      changed: false,
    };
    const members = [...pair.members].sort((a, b) => a - b);
    pair.first = members[0];
    for (const i of members) {
      const edge = edges[i];
      value.count++;
      value.links.push(edge);
      if (!value.kinds.includes(edge.kind)) value.kinds.push(edge.kind);
      if (isChanged(i)) value.changed = true;
    }
    return value;
  };

  return {
    update(visible, unfolded = new Set<string>()) {
      const touched = new Set<Pair>();
      if (previous === null) {
        for (let i = 0; i < edges.length; i++) attach(i, visible, unfolded, touched);
      } else {
        const flipped: string[] = [];
        for (const id of visible) if (!previous.has(id)) flipped.push(id);
        for (const id of previous) if (!visible.has(id)) flipped.push(id);
        for (const id of unfolded) if (!previousUnfolded.has(id)) flipped.push(id);
        for (const id of previousUnfolded) if (!unfolded.has(id)) flipped.push(id);
        if (flipped.length > 0) {
          under ??= buildUnder();
          const affected = new Set<number>();
          for (const id of flipped) for (const i of under.get(id) ?? []) affected.add(i);
          for (const i of affected) attach(i, visible, unfolded, touched);
        }
      }
      previous = new Set(visible);
      previousUnfolded = new Set(unfolded);
      for (const pair of touched) {
        if (pair.members.size === 0) {
          const row = pairs.get(pair.from);
          row?.delete(pair.to);
          if (row?.size === 0) pairs.delete(pair.from);
        } else pair.value = build(pair);
      }
      if (touched.size > 0 || ordered.length === 0) {
        ordered = [];
        result = null;
        for (const row of pairs.values()) for (const pair of row.values()) ordered.push(pair);
        ordered.sort((a, b) => a.first - b.first);
      }
      result ??= ordered.map((pair) => pair.value as AggregatedEdge);
      return result;
    },
  };
}
