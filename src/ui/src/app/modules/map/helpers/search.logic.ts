import type { GraphSnapshot, NodeKind, SearchHit } from '../../../core/models/contract';
import { labelOf } from './node-info.logic';

export interface SearchResult {
  id: string;
  kind: NodeKind;
  label: string;
  path: string;
}

interface Entry extends SearchResult {
  lowerLabel: string;
  lowerName: string;
  lowerPath: string;
}

export type SearchIndex = Entry[];

const MAX_RESULTS = 8;
const SKIPPED: NodeKind[] = ['repo', 'external'];

/** Path of a node in the repository: `auth/session.ts` for a file, its file for a symbol. */
function pathOf(id: string): string {
  const parts = id.split('::');
  const located = [...parts].reverse().find((p) => /^(file|mod):/.test(p));
  const source = located ?? parts[0] ?? id;
  return source.replace(/^(pkg|file|mod):/, '');
}

/** A result for a hit of the core's search. */
export function resultOfHit(hit: SearchHit): SearchResult {
  return { id: hit.id, kind: hit.kind, label: labelOf(hit.id, hit.kind), path: pathOf(hit.id) };
}

export function buildSearchIndex(graph: GraphSnapshot): SearchIndex {
  const entries: Entry[] = [];
  for (const node of graph.nodes) {
    if (SKIPPED.includes(node.kind)) continue;
    const label = labelOf(node.id, node.kind, node.path);
    const path = pathOf(node.id);
    entries.push({
      id: node.id,
      kind: node.kind,
      label,
      path,
      lowerLabel: label.toLowerCase(),
      lowerName: (label.split('.').pop() ?? label).toLowerCase(),
      lowerPath: path.toLowerCase(),
    });
  }
  return entries;
}

function nameRank(entry: Entry, q: string): number | null {
  if (entry.lowerName === q || entry.lowerLabel === q) return 0;
  if (entry.lowerName.startsWith(q) || entry.lowerLabel.startsWith(q)) return 1;
  if (entry.lowerLabel.includes(q)) return 2;
  return null;
}

/** `/checkout`: files and modules whose path has a segment starting with it. */
function pathRank(entry: Entry, q: string): number | null {
  if (entry.kind === 'symbol') return null;
  const text = `/${entry.lowerPath}`;
  const base = (text.split('/').pop() ?? '').replace(/\.[^.]*$/, '');
  if (base === q) return 0;
  return text.includes(`/${q}`) ? 1 : null;
}

/** Up to 8 results for a name or path query, best first (exact name, prefix, substring). */
export function searchNodes(index: SearchIndex, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byPath = q.startsWith('/');
  const needle = byPath ? q.slice(1) : q;
  if (!needle) return [];
  const ranked: { entry: Entry; rank: number; order: number }[] = [];
  index.forEach((entry, order) => {
    const rank = byPath ? pathRank(entry, needle) : nameRank(entry, needle);
    if (rank !== null) ranked.push({ entry, rank, order });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.slice(0, MAX_RESULTS).map(({ entry }) => ({
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    path: entry.path,
  }));
}
