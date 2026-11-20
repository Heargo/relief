import type { Edge, EdgeKind } from '../../../core/models/contract';
import type { Rect } from './layout.logic';

/** The fine edges between two visible boxes, merged into one directed pair. */
export interface AggregatedEdge {
  from: string;
  to: string;
  count: number;
  kinds: EdgeKind[];
  links: Edge[];
  /** At least one of the links changed (always false outside review mode). */
  changed: boolean;
}

export interface AggregateOptions {
  changed?: (edge: Edge) => boolean;
}

/** First ancestor (the node itself included) that is visible, or null. */
export function visibleAncestor(
  id: string,
  parents: Map<string, string | null>,
  visible: Set<string>,
): string | null {
  const seen = new Set<string>();
  for (let cur: string | null | undefined = id; cur && !seen.has(cur); cur = parents.get(cur)) {
    if (visible.has(cur)) return cur;
    seen.add(cur);
  }
  return null;
}

export function isAncestor(
  ancestor: string,
  id: string,
  parents: Map<string, string | null>,
): boolean {
  const seen = new Set<string>();
  for (let cur = parents.get(id); cur && !seen.has(cur); cur = parents.get(cur)) {
    if (cur === ancestor) return true;
    seen.add(cur);
  }
  return false;
}

/**
 * Attaches each fine edge to the first visible ancestor of its ends, drops the edges internal to
 * a box or between a box and one of its descendants, and merges the rest per ordered pair.
 */
export function aggregateEdges(
  edges: Edge[],
  parents: Map<string, string | null>,
  visible: Set<string>,
  opts: AggregateOptions = {},
): AggregatedEdge[] {
  const pairs = new Map<string, AggregatedEdge>();
  for (const edge of edges) {
    const from = visibleAncestor(edge.from, parents, visible);
    const to = visibleAncestor(edge.to, parents, visible);
    if (!from || !to || from === to) continue;
    if (isAncestor(from, to, parents) || isAncestor(to, from, parents)) continue;
    const key = `${from}\u0000${to}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = { from, to, count: 0, kinds: [], links: [], changed: false };
      pairs.set(key, pair);
    }
    pair.count++;
    pair.links.push(edge);
    if (!pair.kinds.includes(edge.kind)) pair.kinds.push(edge.kind);
    if (opts.changed?.(edge)) pair.changed = true;
  }
  return [...pairs.values()];
}

/** The "unchanged edges" layer: hidden, only the pairs with a changed link remain. */
export function filterEdges(edges: AggregatedEdge[], showUnchanged: boolean): AggregatedEdge[] {
  return showUnchanged ? edges : edges.filter((e) => e.changed);
}

/** Stroke width in pixels, like the mockup: grows with the number of links, bounded. */
export function edgeThickness(count: number): number {
  return Math.min(6, 1.3 + 0.9 * Math.log2(Math.max(1, count)));
}

export type EdgeLabelClass = 'base' | 'add' | 'del' | 'viol' | 'violOld' | 'mov';

export interface EdgeLabelInput {
  count: number;
  added: number;
  removed: number;
  moved: number;
  cls: EdgeLabelClass;
  /** The diff layer is on. */
  review: boolean;
}

/** The words of an edge label, in the language of the app. */
export interface EdgeLabelWords {
  new: string;
  moved: string;
}

export interface EdgeClassInput {
  count: number;
  added: number;
  removed: number;
  moved: number;
  /** Fine links violating a rule: introduced by the PR, or already there. */
  violations: { introduced: number; existing: number };
  /** The edge is on the impact path: painted `hl` (the label text stays the status one). */
  highlighted?: boolean;
  review: boolean;
}

/** Status class of an edge, like the mockup's `edgeClass`; `hl` wins when highlighted. */
export function edgeLabelClass(edge: EdgeClassInput): EdgeLabelClass | 'hl' {
  if (edge.highlighted) return 'hl';
  const live = edge.count - edge.removed - edge.moved;
  if (edge.moved > 0 && edge.moved === edge.count) return 'mov';
  if (edge.violations.introduced > 0) return 'viol';
  if (edge.violations.existing > 0) return 'violOld';
  if (edge.review && edge.added > 0 && live === edge.added) return 'add';
  if (edge.review && edge.removed > 0 && live === 0) return 'del';
  return 'base';
}

/** Text written on an edge, like the mockup's `edgeLabel`; empty when there is nothing to say. */
export function edgeLabel(edge: EdgeLabelInput, words: EdgeLabelWords): string {
  const live = edge.count - edge.removed - edge.moved;
  if (edge.cls === 'mov') return words.moved;
  if (edge.cls === 'viol' || edge.cls === 'violOld') return `\u26a0 ${live}`;
  if (edge.cls === 'add') return live > 1 ? `+${live}` : words.new;
  if (edge.cls === 'del') return `\u2212${edge.removed}`;
  let text = live > 1 ? String(live) : '';
  if (edge.review) {
    if (edge.added) text += ` +${edge.added}`;
    if (edge.removed) text += ` \u2212${edge.removed}`;
  }
  return text.trim();
}

/** A label is written only on an edge longer than 60 px on screen. */
export function edgeLabelVisible(label: string, screenLength: number): boolean {
  return label !== '' && screenLength > 60;
}

function defaultUnit(count: number): string {
  return count === 1 ? '1 link' : `${count} links`;
}

/** `apps/web → apps/api · 3 links (HTTP)`. */
export function edgeTooltip(
  edge: Pick<AggregatedEdge, 'from' | 'to' | 'count' | 'kinds'>,
  label: (id: string) => string,
  unit: (count: number) => string = defaultUnit,
): string {
  const kinds = edge.kinds.map((k) => (k === 'http' ? 'HTTP' : k)).join(', ');
  return `${label(edge.from)} → ${label(edge.to)} · ${unit(edge.count)} (${kinds})`;
}

export interface EdgeShape {
  /** Curve between the borders of the two boxes. */
  d: string;
  /** Arrow head at the `to` end. */
  arrow: string;
  /** Middle of the curve (label position). */
  mx: number;
  my: number;
  /** The label could not leave a box: it must not catch clicks meant for that box. */
  covered: boolean;
  /** On-screen distance between the two borders. */
  length: number;
}

interface Point {
  x: number;
  y: number;
}

/** Where the segment from the center of `rect` to `target` leaves the rect. */
function borderPoint(rect: Rect, target: Point): Point {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s };
}

const LABEL_POSITIONS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
const LABEL_HALF_WIDTH = 14;
const LABEL_HALF_HEIGHT = 8;
const ARROW_LENGTH = 9;
const ARROW_HALF_WIDTH = 4;

/** Quadratic curve from box border to box border, bent to the side so both directions apart. */
export function edgeShape(a: Rect, b: Rect, avoid: Rect[] = []): EdgeShape {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p0 = borderPoint(a, cb);
  const p1 = borderPoint(b, ca);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(60, len * 0.18);
  const c = { x: (p0.x + p1.x) / 2 - (dy / len) * bend, y: (p0.y + p1.y) / 2 + (dx / len) * bend };
  const tx = p1.x - c.x;
  const ty = p1.y - c.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const bx = p1.x - ux * ARROW_LENGTH;
  const by = p1.y - uy * ARROW_LENGTH;
  const arrow =
    `M${p1.x},${p1.y}L${bx - uy * ARROW_HALF_WIDTH},${by + ux * ARROW_HALF_WIDTH}` +
    `L${bx + uy * ARROW_HALF_WIDTH},${by - ux * ARROW_HALF_WIDTH}Z`;
  const at = (t: number): Point => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
  });
  // The count tag sits mid-curve, slid along it off the boxes it would otherwise hide.
  const free = LABEL_POSITIONS.find((t) => {
    const m = at(t);
    return !avoid.some(
      (r) =>
        m.x + LABEL_HALF_WIDTH > r.x &&
        m.x - LABEL_HALF_WIDTH < r.x + r.w &&
        m.y + LABEL_HALF_HEIGHT > r.y &&
        m.y - LABEL_HALF_HEIGHT < r.y + r.h,
    );
  });
  const mid = at(free ?? 0.5);
  return {
    d: `M${p0.x},${p0.y}Q${c.x},${c.y} ${p1.x},${p1.y}`,
    arrow,
    mx: mid.x,
    my: mid.y,
    covered: free === undefined,
    length: Math.hypot(dx, dy),
  };
}
