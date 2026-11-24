import type { Edge, EdgeKind } from '../../../core/models/contract';
import type { BoxGrid } from './box-grid.logic';
import { roundedPath, type RoutePoint } from './edge-routing.logic';
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
  /** Tells a symbol node: a visible symbol end folds up to its file unless the edge is unfolded. */
  isSymbol?: (id: string) => boolean;
  /** Nodes whose edges (those with an end at or under them) keep their symbol ends. */
  unfolded?: ReadonlySet<string>;
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

/** `visibleAncestor` without allocation: a cycle in the parents is cut by a step budget. */
export function firstVisible(
  id: string,
  parents: Map<string, string | null>,
  visible: Set<string>,
  budget: number,
): string | null {
  let cur: string | null | undefined = id;
  for (let n = 0; cur && n <= budget; n++, cur = parents.get(cur)) {
    if (visible.has(cur)) return cur;
  }
  return null;
}

/** An edge with an end at or under an unfolded node keeps its symbol ends. */
export function isUnfoldedEdge(
  edge: Edge,
  parents: Map<string, string | null>,
  unfolded: ReadonlySet<string> | undefined,
  budget: number,
): boolean {
  if (!unfolded || unfolded.size === 0) return false;
  for (const end of [edge.from, edge.to]) {
    let cur: string | null | undefined = end;
    for (let n = 0; cur && n <= budget; n++, cur = parents.get(cur)) {
      if (unfolded.has(cur)) return true;
    }
  }
  return false;
}

/** A visible symbol end rises to its (visible) file; any other end stays. */
export function foldSymbolEnd(
  id: string | null,
  parents: Map<string, string | null>,
  visible: Set<string>,
  isSymbol: (id: string) => boolean,
  budget: number,
): string | null {
  if (id === null || !isSymbol(id)) return id;
  const parent = parents.get(id);
  return parent ? firstVisible(parent, parents, visible, budget) : id;
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
  const isSymbol = opts.isSymbol;
  const unfolded = opts.unfolded;
  const budget = parents.size + 1;
  for (const edge of edges) {
    let from = visibleAncestor(edge.from, parents, visible);
    let to = visibleAncestor(edge.to, parents, visible);
    if (isSymbol && !isUnfoldedEdge(edge, parents, unfolded, budget)) {
      from = foldSymbolEnd(from, parents, visible, isSymbol, budget);
      to = foldSymbolEnd(to, parents, visible, isSymbol, budget);
    }
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

const LABEL_MIN_SCREEN_LENGTH = 60;

/** Whether an edge this long on screen can show a label, so is worth placing one. */
export function edgeLabelNeedsPlacement(screenLength: number): boolean {
  return screenLength > LABEL_MIN_SCREEN_LENGTH;
}

/** A label is written only on an edge longer than 60 px on screen. */
export function edgeLabelVisible(label: string, screenLength: number): boolean {
  return label !== '' && edgeLabelNeedsPlacement(screenLength);
}

/** An edge as the label rule sees it; `violation` keeps the label at rest. */
export interface LabelEdge {
  from: string;
  to: string;
  violation?: boolean;
}

/** What makes an individual edge label show: hover, selection, or the "always" switch. */
export interface EdgeLabelContext {
  hovered: { from: string; to: string } | null;
  selectedNode: string | null;
  selectedEdge: { from: string; to: string } | null;
  always: boolean;
}

export const EDGE_LABELS_REST: EdgeLabelContext = {
  hovered: null,
  selectedNode: null,
  selectedEdge: null,
  always: false,
};

/** No label at rest, except a rule violation; hovered edge, edges of the selected node, selected edge. */
export function edgeLabelShown(edge: LabelEdge, ctx: EdgeLabelContext): boolean {
  if (ctx.always || edge.violation) return true;
  const same = (o: { from: string; to: string } | null) =>
    o !== null && o.from === edge.from && o.to === edge.to;
  return (
    same(ctx.hovered) ||
    same(ctx.selectedEdge) ||
    (ctx.selectedNode !== null && (ctx.selectedNode === edge.from || ctx.selectedNode === edge.to))
  );
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
  /** On-screen distance between the two borders (world distance times the scale). */
  length: number;
  /** The route along the corridors (world units); null or absent: the direct curve. */
  route?: RoutePoint[] | null;
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

/** On-screen distance between the borders of two world rects drawn at `scale`. */
function screenLength(a: Rect, b: Rect, scale: number): number {
  const sa = { x: a.x * scale, y: a.y * scale, w: a.w * scale, h: a.h * scale };
  const sb = { x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale };
  const p0 = borderPoint(sa, { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 });
  const p1 = borderPoint(sb, { x: sa.x + sa.w / 2, y: sa.y + sa.h / 2 });
  return Math.hypot(p1.x - p0.x, p1.y - p0.y);
}

const LABEL_POSITIONS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
const LABEL_HALF_WIDTH = 14;
const LABEL_HALF_HEIGHT = 8;
const ARROW_LENGTH = 9;
const ARROW_HALF_WIDTH = 4;

/** What of an edge shape does not depend on the boxes to avoid: the curve, the arrow, the length. */
export interface EdgeGeometry {
  p0: Point;
  c: Point;
  p1: Point;
  d: string;
  arrow: string;
  length: number;
}

export function edgeGeometry(a: Rect, b: Rect, scale = 1): EdgeGeometry {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p0 = borderPoint(a, cb);
  const p1 = borderPoint(b, ca);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(60 / scale, len * 0.18);
  const c = { x: (p0.x + p1.x) / 2 - (dy / len) * bend, y: (p0.y + p1.y) / 2 + (dx / len) * bend };
  const tx = p1.x - c.x;
  const ty = p1.y - c.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const bx = p1.x - (ux * ARROW_LENGTH) / scale;
  const by = p1.y - (uy * ARROW_LENGTH) / scale;
  const arrow =
    `M${p1.x},${p1.y}L${bx - (uy * ARROW_HALF_WIDTH) / scale},${by + (ux * ARROW_HALF_WIDTH) / scale}` +
    `L${bx + (uy * ARROW_HALF_WIDTH) / scale},${by - (ux * ARROW_HALF_WIDTH) / scale}Z`;
  return {
    p0,
    c,
    p1,
    d: `M${p0.x},${p0.y}Q${c.x},${c.y} ${p1.x},${p1.y}`,
    arrow,
    length: screenLength(a, b, scale),
  };
}

/**
 * Quadratic curve from box border to box border, bent to the side so both directions apart. The
 * rects are in world units and so is the shape; `scale` (screen pixels per world unit) only sizes
 * what is drawn in screen pixels (bend cap, arrow head, label room), so that the shape is
 * the screen one mapped back to the world. `geometry` is the one `edgeGeometry` gave for the same
 * rects and scale, when it is kept.
 */
export function edgeShape(
  a: Rect,
  b: Rect,
  avoid: Rect[] | BoxGrid = [],
  scale = 1,
  geometry: EdgeGeometry = edgeGeometry(a, b, scale),
): EdgeShape {
  const { p0, c, p1 } = geometry;
  const at = (t: number): Point => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
  });
  // An edge too short on screen shows no label: keep it mid-curve, without looking at the boxes.
  if (!edgeLabelNeedsPlacement(geometry.length)) {
    const mid = at(0.5);
    return {
      d: geometry.d,
      arrow: geometry.arrow,
      mx: mid.x,
      my: mid.y,
      covered: false,
      length: geometry.length,
    };
  }
  // The count tag sits mid-curve, slid along it off the boxes it would otherwise hide.
  const halfW = LABEL_HALF_WIDTH / scale;
  const halfH = LABEL_HALF_HEIGHT / scale;
  let free: number | undefined;
  for (const t of LABEL_POSITIONS) {
    const m = at(t);
    const hit = Array.isArray(avoid)
      ? avoid.some(
          (r) =>
            m.x + halfW > r.x &&
            m.x - halfW < r.x + r.w &&
            m.y + halfH > r.y &&
            m.y - halfH < r.y + r.h,
        )
      : (avoid as BoxGrid).hits(m.x, m.y, halfW, halfH);
    if (!hit) {
      free = t;
      break;
    }
  }
  const mid = at(free ?? 0.5);
  return {
    d: geometry.d,
    arrow: geometry.arrow,
    mx: mid.x,
    my: mid.y,
    covered: free === undefined,
    length: geometry.length,
  };
}

/** The point of a route at fraction `t` of its length. */
function routeAt(route: readonly RoutePoint[], total: number, t: number): Point {
  let left = total * t;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || i === route.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, left / len);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= len;
  }
  return route[0];
}

/**
 * The shape of an edge that follows a route: rounded corners, an arrow head along the last
 * segment, the label slid along the route off the boxes. `base` gives the on-screen length.
 */
export function routedEdgeShape(
  route: RoutePoint[],
  avoid: Rect[] | BoxGrid,
  scale: number,
  base: EdgeShape,
): EdgeShape {
  const p1 = route[route.length - 1];
  const p0 = route[route.length - 2];
  const tl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const ux = (p1.x - p0.x) / tl;
  const uy = (p1.y - p0.y) / tl;
  const bx = p1.x - (ux * ARROW_LENGTH) / scale;
  const by = p1.y - (uy * ARROW_LENGTH) / scale;
  const arrow =
    `M${p1.x},${p1.y}L${bx - (uy * ARROW_HALF_WIDTH) / scale},${by + (ux * ARROW_HALF_WIDTH) / scale}` +
    `L${bx + (uy * ARROW_HALF_WIDTH) / scale},${by - (ux * ARROW_HALF_WIDTH) / scale}Z`;
  let total = 0;
  for (let i = 1; i < route.length; i++)
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
  const halfW = LABEL_HALF_WIDTH / scale;
  const halfH = LABEL_HALF_HEIGHT / scale;
  let mid = routeAt(route, total, 0.5);
  let covered = false;
  if (edgeLabelNeedsPlacement(base.length)) {
    covered = true;
    for (const t of LABEL_POSITIONS) {
      const m = routeAt(route, total, t);
      const hit = Array.isArray(avoid)
        ? avoid.some(
            (r) =>
              m.x + halfW > r.x &&
              m.x - halfW < r.x + r.w &&
              m.y + halfH > r.y &&
              m.y - halfH < r.y + r.h,
          )
        : (avoid as BoxGrid).hits(m.x, m.y, halfW, halfH);
      if (!hit) {
        mid = m;
        covered = false;
        break;
      }
    }
  }
  return {
    d: roundedPath(route, 10 / scale),
    arrow,
    mx: mid.x,
    my: mid.y,
    covered,
    length: base.length,
    route,
  };
}
