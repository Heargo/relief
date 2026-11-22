import type { Camera, Viewport } from './camera.logic';
import type { Rect } from './layout.logic';

/** Edges on screen above which the unchanged ones are drawn in a single path. */
export const EDGE_MERGE_THRESHOLD = 500;

/** What decides whether an edge keeps its full rendering. */
export interface EdgeDetail {
  changed: boolean;
  violations: { introduced: number; existing: number };
  selected: boolean;
  onImpactPath: boolean;
}

/** The box that holds the two boxes an edge joins (world units). */
export function edgeBounds(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Whether a world box meets the screen, widened by `margin` pixels on every side. */
export function edgeInView(box: Rect, camera: Camera, viewport: Viewport, margin: number): boolean {
  const left = box.x * camera.scale + camera.tx;
  const top = box.y * camera.scale + camera.ty;
  const right = left + box.w * camera.scale;
  const bottom = top + box.h * camera.scale;
  return (
    right >= -margin &&
    bottom >= -margin &&
    left <= viewport.width + margin &&
    top <= viewport.height + margin
  );
}

function keepsFullRendering(edge: EdgeDetail): boolean {
  return (
    edge.changed ||
    edge.violations.introduced > 0 ||
    edge.violations.existing > 0 ||
    edge.selected ||
    edge.onImpactPath
  );
}

/** Beyond the threshold, the unchanged edges go to `merged`; the others stay in full. */
export function partitionEdges<T extends EdgeDetail>(
  edges: readonly T[],
  threshold = EDGE_MERGE_THRESHOLD,
): { full: T[]; merged: T[] } {
  if (edges.length <= threshold) return { full: [...edges], merged: [] };
  const full: T[] = [];
  const merged: T[] = [];
  for (const edge of edges) (keepsFullRendering(edge) ? full : merged).push(edge);
  return { full, merged };
}

const CURVE_STEPS = 16;

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToCurve(d: string, p: { x: number; y: number }): number {
  const n = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/gi) ?? []).map(Number);
  if (n.length < 6) return Infinity;
  const [x0, y0, cx, cy, x1, y1] = n;
  let best = Infinity;
  let prev = { x: x0, y: y0 };
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    const next = {
      x: u * u * x0 + 2 * u * t * cx + t * t * x1,
      y: u * u * y0 + 2 * u * t * cy + t * t * y1,
    };
    best = Math.min(best, distanceToSegment(p, prev, next));
    prev = next;
  }
  return best;
}

/** The edge nearest to `point` within `tolerance` (world units), or null. */
export function nearestEdge<T extends { d: string }>(
  edges: readonly T[],
  point: { x: number; y: number },
  tolerance: number,
): T | null {
  let found: T | null = null;
  let best = tolerance;
  for (const edge of edges) {
    const distance = distanceToCurve(edge.d, point);
    if (distance <= best) {
      best = distance;
      found = edge;
    }
  }
  return found;
}
