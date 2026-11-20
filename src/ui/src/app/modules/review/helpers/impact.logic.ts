import type { GraphSnapshot, ImpactedNode, ImpactResponse } from '../../../core/models/contract';

export type ImpactDirection = 'callers' | 'dependencies';

export interface ImpactGroup {
  depth: number;
  nodes: ImpactedNode[];
}

/** The reached nodes grouped by depth, nearest first. */
export function groupByDepth(reached: ImpactedNode[]): ImpactGroup[] {
  const groups = new Map<number, ImpactedNode[]>();
  for (const node of reached) groups.set(node.depth, [...(groups.get(node.depth) ?? []), node]);
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, nodes]) => ({ depth, nodes }));
}

export function withoutTests(reached: ImpactedNode[]): number {
  return reached.filter((r) => !r.tested).length;
}

const packageOf = (id: string): string => id.split('::')[0];

/** The services touched: packages of the reached nodes, other than the seed's (`via[0]`). */
export function serviceCount(reached: ImpactedNode[]): number {
  const packages = new Set<string>();
  for (const r of reached) {
    if (packageOf(r.node) !== packageOf(r.via[0] ?? '')) packages.add(packageOf(r.node));
  }
  return packages.size;
}

/** What the map paints for an impact: the seed, the reached nodes and their boxes. */
export interface ImpactMarks {
  seed: string;
  /** The seed and the reached nodes. */
  reached: ReadonlySet<string>;
  /** `reached` and every box that contains one of them. */
  scope: ReadonlySet<string>;
  /** Reached nodes inside each box, for the closed boxes' "⚡ n". */
  counts: ReadonlyMap<string, number>;
  /** `from>to` of the nodes (and boxes) joined by a step of a path from the seed, both ways. */
  steps: ReadonlySet<string>;
}

/** What the map paints of a node: reached, a box holding reached nodes, or dimmed. */
export type ImpactState = '' | 'hit' | 'box' | 'dim';

export function impactState(marks: ImpactMarks | null, id: string): ImpactState {
  if (!marks) return '';
  if (marks.reached.has(id)) return 'hit';
  return marks.scope.has(id) ? 'box' : 'dim';
}

/** The edge between two nodes lies on a path of the impact. */
export function onImpactPath(marks: ImpactMarks | null, from: string, to: string): boolean {
  return !!marks && marks.steps.has(`${from}>${to}`);
}

export function impactMarks(
  graph: GraphSnapshot,
  seed: string,
  response: ImpactResponse,
): ImpactMarks {
  const parents = new Map(graph.nodes.map((n) => [n.id, n.parent ?? null]));
  const reached = new Set<string>([seed, ...response.reached.map((r) => r.node)]);
  const scope = new Set<string>();
  const counts = new Map<string, number>();
  for (const id of reached) {
    scope.add(id);
    const isSeed = id === seed;
    let up = parents.get(id) ?? null;
    while (up) {
      scope.add(up);
      if (!isSeed) counts.set(up, (counts.get(up) ?? 0) + 1);
      up = parents.get(up) ?? null;
    }
  }
  const lineage = (id: string): string[] => {
    const chain: string[] = [];
    for (let at: string | null = id; at; at = parents.get(at) ?? null) chain.push(at);
    return chain;
  };
  const steps = new Set<string>();
  for (const r of response.reached) {
    const path = [...r.via, r.node];
    for (let i = 0; i + 1 < path.length; i++) {
      for (const a of lineage(path[i])) {
        for (const b of lineage(path[i + 1])) {
          steps.add(`${a}>${b}`);
          steps.add(`${b}>${a}`);
        }
      }
    }
  }
  return { seed, reached, scope, counts, steps };
}
