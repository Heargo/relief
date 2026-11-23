import type { GraphSnapshot } from '../../../core/models/contract';

export const HIDE_EXTERNAL_KEY = 'relief.hideExternal';
export const DEFAULT_HIDE_EXTERNAL = true;

interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Without the external packages, their group and every edge leading to them (display filter). */
export function hideExternalDeps(graph: GraphSnapshot, hide: boolean): GraphSnapshot {
  if (!hide) return graph;
  const hidden = new Set(
    graph.nodes
      .filter((n) => n.kind === 'external' || n.subkind === 'external-group')
      .map((n) => n.id),
  );
  if (hidden.size === 0) return graph;
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !hidden.has(n.id)),
    edges: graph.edges.filter((e) => !hidden.has(e.from) && !hidden.has(e.to)),
  };
}

export function readHideExternal(storage: FlagStorage): boolean {
  try {
    const value = storage.getItem(HIDE_EXTERNAL_KEY);
    return value === 'true' ? true : value === 'false' ? false : DEFAULT_HIDE_EXTERNAL;
  } catch {
    return DEFAULT_HIDE_EXTERNAL;
  }
}

export function writeHideExternal(storage: FlagStorage, hide: boolean): void {
  try {
    storage.setItem(HIDE_EXTERNAL_KEY, String(hide));
  } catch {
    // Storage unavailable: the preference is just not kept.
  }
}

export const EDGE_LABELS_ALWAYS_KEY = 'relief.edgeLabelsAlways';

export function readEdgeLabelsAlways(storage: FlagStorage): boolean {
  try {
    return storage.getItem(EDGE_LABELS_ALWAYS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeEdgeLabelsAlways(storage: FlagStorage, always: boolean): void {
  try {
    storage.setItem(EDGE_LABELS_ALWAYS_KEY, String(always));
  } catch {
    // Storage unavailable: the preference is just not kept.
  }
}
