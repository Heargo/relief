import type { GraphSnapshot } from '../../../core/models/contract';
import { type BoxPair, boxPairsAtLevel, crossingsOfPairs } from './crossings.logic';
import { isWorkspaceRepo, mapParent } from './repo-level.logic';
import { type ChildOrder, groupChildren, layoutInput, rankOf } from './layout.logic';

export type { ChildOrder } from './layout.logic';

export const MAX_ROUNDS = 4;
export const DEFAULT_BUDGET_MS = 300;

export interface OptimizeOptions {
  budgetMs?: number;
  now?: () => number;
}

export interface OptimizeResult {
  order: ChildOrder;
  rounds: number;
  aborted: boolean;
}

/** Children of each container sorted by id (`null`: the children of the repo). */
export function alphabeticalOrder(graph: GraphSnapshot): ChildOrder {
  const order: ChildOrder = new Map();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const node of graph.nodes) {
    if (node.kind === 'repo' && !isWorkspaceRepo(node)) continue;
    const parent = mapParent(node, byId)?.id ?? null;
    // Loose files at the top come last whatever the order: they are not part of it.
    if (parent === null && rankOf(node.kind) === 2) continue;
    const list = order.get(parent) ?? [];
    list.push(node.id);
    order.set(parent, list);
  }
  for (const list of order.values()) list.sort(compareIds);
  return order;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Local search on the order of the children: swaps of pairs, kept when the sum of the crossings
 * at the module, file and symbol levels goes down. At most 4 rounds; gives up once the budget is
 * spent and returns the best order found so far.
 */
export function optimizeOrder(graph: GraphSnapshot, opts: OptimizeOptions = {}): OptimizeResult {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const now = opts.now ?? (() => performance.now());
  const start = now();
  const order = alphabeticalOrder(graph);

  const input = groupChildren(graph);
  const first = layoutInput(input, order);
  const anchor = first.roots[0];
  const levels: BoxPair[][] = [1, 2, 3].map((level) => boxPairsAtLevel(first, graph, level));
  const cost = () => {
    const layout = layoutInput(input, order);
    // The box shown first stays the same: level jumps from the whole map start on it.
    if (layout.roots[0] !== anchor) return Infinity;
    return levels.reduce((sum, pairs) => sum + crossingsOfPairs(layout, pairs), 0);
  };

  let best = cost();
  let rounds = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    rounds++;
    let improved = false;
    for (const list of order.values()) {
      for (let i = 0; i < list.length - 1; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (now() - start >= budgetMs) return { order, rounds, aborted: true };
          [list[i], list[j]] = [list[j], list[i]];
          const trial = cost();
          if (trial < best) {
            best = trial;
            improved = true;
          } else {
            [list[i], list[j]] = [list[j], list[i]];
          }
        }
      }
    }
    if (!improved) break;
  }
  return { order, rounds, aborted: false };
}
