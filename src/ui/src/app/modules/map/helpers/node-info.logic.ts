import type { GraphSnapshot, NodeKind } from '../../../core/models/contract';

/** What a box says about its node: name, type and counters. */
export interface NodeInfo {
  kind: NodeKind;
  subkind: string;
  label: string;
  /** Descendant symbols (0 for a symbol). */
  symbols: number;
  /** Descendant files. */
  files: number;
}

/** Last readable segment of an id: `file:apps/api/auth/session.ts` -> `session.ts`. */
export function labelOf(id: string, kind: NodeKind, path?: string | null): string {
  if (path && (kind === 'service' || kind === 'package')) return path;
  const last = id.split('::').pop() ?? id;
  const name = last.replace(/^(pkg|file|mod|sym):/, '');
  if (kind === 'file') return name.split('/').pop() ?? name;
  if (kind === 'external') return name.replace(/^external\//, '');
  if (kind === 'module') return `${name.split('/').pop() ?? name}/`;
  return name;
}

export function buildNodeInfos(graph: GraphSnapshot): Map<string, NodeInfo> {
  const infos = new Map<string, NodeInfo>();
  const parents = new Map<string, string | null>();
  for (const node of graph.nodes) {
    parents.set(node.id, node.parent ?? null);
    infos.set(node.id, {
      kind: node.kind,
      subkind: node.subkind,
      label: labelOf(node.id, node.kind, node.path),
      symbols: 0,
      files: 0,
    });
  }
  for (const node of graph.nodes) {
    if (node.kind !== 'symbol' && node.kind !== 'file') continue;
    for (let p = parents.get(node.id) ?? null; p; p = parents.get(p) ?? null) {
      const info = infos.get(p);
      if (!info) break;
      if (node.kind === 'symbol') info.symbols++;
      else info.files++;
    }
  }
  return infos;
}
