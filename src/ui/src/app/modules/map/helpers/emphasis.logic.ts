import type { AggregatedEdge } from './edges.logic';

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; from: string; to: string };

export type EdgeEmphasis = 'out' | 'in' | 'picked' | 'dim' | 'normal';
export type NodeEmphasis = 'sharp' | 'dim';

/** Whether `id` is the box `box` or lies inside it (a fine edge end under a visible box). */
export type Within = (id: string, box: string) => boolean;
const same: Within = (id, box) => id === box;

export function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

/** Which edges stand out for the selection: outgoing, incoming, picked; the rest dims. */
export function edgeEmphasis(
  edges: readonly AggregatedEdge[],
  selection: Selection | null,
  visibleOf: (id: string) => string | null,
  within: Within = same,
): Map<string, EdgeEmphasis> {
  const result = new Map<string, EdgeEmphasis>();
  const at = selection?.kind === 'node' ? visibleOf(selection.id) : null;
  for (const { from, to } of edges) {
    let state: EdgeEmphasis = 'normal';
    if (selection?.kind === 'node') {
      state =
        at !== null && within(from, at) ? 'out' : at !== null && within(to, at) ? 'in' : 'dim';
    } else if (selection?.kind === 'edge') {
      state = from === selection.from && to === selection.to ? 'picked' : 'dim';
    }
    result.set(edgeKey(from, to), state);
  }
  return result;
}

/** The selected node and its direct neighbours (or the two ends of the selected edge) stay sharp. */
export function nodeEmphasis(
  ids: readonly string[],
  edges: readonly AggregatedEdge[],
  selection: Selection | null,
  visibleOf: (id: string) => string | null,
  keep: ReadonlySet<string> = new Set(),
  within: Within = same,
): Map<string, NodeEmphasis> {
  const sharp = new Set<string>();
  if (selection?.kind === 'node') {
    const at = visibleOf(selection.id);
    if (at !== null) {
      sharp.add(at);
      for (const id of ids) if (within(id, at)) sharp.add(id);
      for (const { from, to } of edges) {
        if (within(from, at)) sharp.add(to);
        else if (within(to, at)) sharp.add(from);
      }
    }
  } else if (selection?.kind === 'edge') {
    sharp.add(selection.from);
    sharp.add(selection.to);
  }
  const result = new Map<string, NodeEmphasis>();
  for (const id of ids) {
    result.set(id, !selection || sharp.has(id) || keep.has(id) ? 'sharp' : 'dim');
  }
  return result;
}
