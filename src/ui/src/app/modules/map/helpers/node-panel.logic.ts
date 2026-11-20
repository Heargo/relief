import type { EdgeKind, GraphSnapshot, Node, NodeKind } from '../../../core/models/contract';
import { labelOf } from './node-info.logic';

/** A fine link shown in the panel: the other end of an edge and the link type. */
export interface PanelLink {
  id: string;
  label: string;
  edgeKind: EdgeKind;
}

export interface PanelChild {
  id: string;
  label: string;
  kind: NodeKind;
}

/** Facts of the graph about one node: nothing generated (ADR 0005). */
export interface NodePanelFacts {
  name: string;
  kind: NodeKind;
  subkind: string;
  visibility: string;
  path: string | null;
  children: PanelChild[];
  uses: PanelLink[];
  usedBy: PanelLink[];
}

export interface CodeLine {
  number: number;
  text: string;
}

/** Path of the file holding a node: its own path, else the `file:` segment of its id. */
function pathOf(node: Node): string | null {
  if (node.path) return node.path;
  const segment = node.id.split('::').find((s) => s.startsWith('file:'));
  return segment ? segment.slice('file:'.length) : null;
}

function startOf(node: Node): number {
  return node.span?.startLine ?? Number.POSITIVE_INFINITY;
}

export function nodePanelFacts(graph: GraphSnapshot, id: string): NodePanelFacts | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(id);
  if (!node) return null;
  const label = (other: string): string => {
    const found = byId.get(other);
    return found ? labelOf(found.id, found.kind, found.path) : labelOf(other, 'symbol');
  };

  const links = (side: 'from' | 'to'): PanelLink[] => {
    const other = side === 'from' ? 'to' : 'from';
    const seen = new Set<string>();
    const result: PanelLink[] = [];
    for (const edge of graph.edges) {
      if (edge[side] !== id) continue;
      const key = `${edge[other]}|${edge.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: edge[other], label: label(edge[other]), edgeKind: edge.kind });
    }
    return result.sort(
      (a, b) => a.label.localeCompare(b.label) || a.edgeKind.localeCompare(b.edgeKind),
    );
  };

  // Source reading order: by start line, then label; nodes without a span last, by label.
  const children = graph.nodes
    .filter((n) => n.parent === id)
    .map((n) => ({
      id: n.id,
      label: labelOf(n.id, n.kind, n.path),
      kind: n.kind,
      start: startOf(n),
    }))
    .sort(
      (a, b) =>
        (a.start === b.start ? 0 : a.start < b.start ? -1 : 1) || a.label.localeCompare(b.label),
    )
    .map(({ start: _start, ...child }) => child);

  return {
    name: labelOf(node.id, node.kind, node.path),
    kind: node.kind,
    subkind: node.subkind,
    visibility: node.visibility,
    path: pathOf(node),
    children,
    // `uses` follows edges leaving the node, `usedBy` those arriving at it.
    uses: links('from'),
    usedBy: links('to'),
  };
}

/** Splits code into numbered lines; a trailing newline does not add a line. */
export function codeLines(text: string, startLine: number): CodeLine[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line, i) => ({ number: startLine + i, text: line }));
}

/**
 * Splits highlighted HTML (highlight.js spans) into one balanced HTML string per line,
 * closing and reopening the spans that cross a line break.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
    } else {
      if (part.startsWith('<span')) open.push(part);
      else if (part === '</span>') open.pop();
      current += part;
    }
  }
  lines.push(current + '</span>'.repeat(open.length));
  if (lines[lines.length - 1] === '' && html.endsWith('\n')) lines.pop();
  return lines;
}

/** Whether the light highlighter knows the language of this file. */
export function isHighlightable(path: string | null): boolean {
  return path !== null && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path);
}
