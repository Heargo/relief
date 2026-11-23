/** "Tested by N (of which M new)" on the target of folded test edges. */
export interface TestedBy {
  count: number;
  added: number;
}

export interface FoldTestEdgesOptions<E> {
  /** Tells a node flagged as a test by the core (or lying under one). */
  isTest: (id: string) => boolean;
  /** The "Tests" layer is expanded: everything is drawn, as before. */
  layerOn: boolean;
  /** The selected node: if it is a test, its edges are kept. */
  selected: string | null;
  /** Targets whose test edges were unfolded (click on their badge). */
  unfolded: ReadonlySet<string>;
  /** The box that draws an end, or null when it is not on the map; defaults to the end itself. */
  shown?: (id: string) => string | null;
  /** The edge is new or changed in the diff: its test counts as "new" on the badge. */
  changed?: (edge: E) => boolean;
}

/**
 * Folds the edges whose source is a test while the "Tests" layer is collapsed: they are not
 * drawn, and their target box gets a badge counting the distinct tests. The edges of the
 * selected test and those of an unfolded target stay drawn (the badge stays too).
 */
export function foldTestEdges<E extends { from: string; to: string }>(
  edges: readonly E[],
  options: FoldTestEdgesOptions<E>,
): { edges: E[]; badges: Map<string, TestedBy> } {
  if (options.layerOn) return { edges: [...edges], badges: new Map() };
  const shown = options.shown ?? ((id: string) => id);
  const selected = options.selected === null ? null : (shown(options.selected) ?? options.selected);
  const kept: E[] = [];
  const sources = new Map<string, Map<string, boolean>>();
  for (const edge of edges) {
    const source = shown(edge.from);
    if (source === null || !options.isTest(source)) {
      kept.push(edge);
      continue;
    }
    const target = shown(edge.to);
    if (target !== null && !options.isTest(target)) {
      const bySource = sources.get(target) ?? new Map<string, boolean>();
      bySource.set(source, (bySource.get(source) ?? false) || (options.changed?.(edge) ?? false));
      sources.set(target, bySource);
    }
    if (source === selected || (target !== null && options.unfolded.has(target))) kept.push(edge);
  }
  const badges = new Map<string, TestedBy>();
  for (const [target, bySource] of sources) {
    badges.set(target, {
      count: bySource.size,
      added: [...bySource.values()].filter(Boolean).length,
    });
  }
  return { edges: kept, badges };
}

/** Ids of the nodes that are tests or lie under one (a symbol of a test file). */
export function testNodeIds(
  nodes: readonly { id: string; parent?: string | null; isTest?: boolean }[],
): Set<string> {
  const parents = new Map(nodes.map((n) => [n.id, n.parent ?? null]));
  const flagged = new Set(nodes.filter((n) => n.isTest).map((n) => n.id));
  const result = new Set<string>();
  for (const { id } of nodes) {
    for (
      let cur: string | null | undefined = id, n = 0;
      cur && n < 64;
      cur = parents.get(cur), n++
    ) {
      if (flagged.has(cur)) {
        result.add(id);
        break;
      }
    }
  }
  return result;
}
