import type { GraphSnapshot, Metrics } from '../../../core/models/contract';

export interface Hotspot {
  id: string;
  risk: number;
}

const HOTSPOT_LIMIT = 6;
const LEVELS = 4;

/** Complexity x churn x (1 tested, 2 untested); a missing complexity counts for 1, no churn is no risk. */
export function rawRisk(metrics: Metrics): number {
  const churn = metrics.churn ?? 0;
  if (churn <= 0) return 0;
  return (metrics.complexity ?? 1) * churn * (metrics.tested ? 1 : 2);
}

/**
 * The risk of every node in [0, 1]: a symbol's raw risk over the largest one among the symbols, a
 * container (file, module, package) the max of its descendants.
 */
export function riskMap(
  graph: GraphSnapshot,
  metrics: Record<string, Metrics>,
): Map<string, number> {
  const symbols = graph.nodes.filter((n) => n.kind === 'symbol');
  const raw = new Map(symbols.map((n) => [n.id, metrics[n.id] ? rawRisk(metrics[n.id]) : 0]));
  const largest = Math.max(0, ...raw.values());
  const risk = new Map<string, number>();
  for (const node of graph.nodes) risk.set(node.id, 0);
  for (const [id, value] of raw) risk.set(id, largest > 0 ? value / largest : 0);

  const parentOf = new Map(graph.nodes.map((n) => [n.id, n.parent]));
  for (const [id, value] of raw) {
    if (largest <= 0) break;
    const share = value / largest;
    const seen = new Set<string>();
    let parent = parentOf.get(id);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      risk.set(parent, Math.max(risk.get(parent) ?? 0, share));
      parent = parentOf.get(parent);
    }
  }
  return risk;
}

/** The riskiest symbols, by decreasing risk then id, without the ones at 0. */
export function hotspots(
  graph: GraphSnapshot,
  metrics: Record<string, Metrics>,
  limit = HOTSPOT_LIMIT,
): Hotspot[] {
  const risk = riskMap(graph, metrics);
  return graph.nodes
    .filter((n) => n.kind === 'symbol' && (risk.get(n.id) ?? 0) > 0)
    .map((n) => ({ id: n.id, risk: risk.get(n.id) ?? 0 }))
    .sort((a, b) => b.risk - a.risk || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}

/** The tint step 0..4 of a risk: ceil(risk x 4), 0 stays 0. */
export function riskLevel(risk: number): number {
  return risk <= 0 ? 0 : Math.min(LEVELS, Math.ceil(risk * LEVELS - 1e-9));
}
