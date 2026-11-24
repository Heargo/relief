import type { MapLayout } from './layout.logic';

export interface RoutePoint {
  x: number;
  y: number;
}

/**
 * The grid of corridors of a layout, as plain data (plain arrays and strings: it is made in the
 * layout worker and crosses its boundary). The lines of the grid are the borders of every box
 * (plus a margin around the map); each cell between two lines holds the deepest box that contains
 * it, or -1 when it is free. A route runs through the centers of the cells.
 */
export interface Corridors {
  /** Ids of the boxes, by index. */
  ids: string[];
  /** `x, y, w, h` of each box. */
  rects: number[];
  /** Parent box index of each box, -1 at the top. */
  parents: number[];
  /** Index, in `xs` and `ys`, of the borders of each box: `x0, x1, y0, y1`. */
  spans: number[];
  /** The vertical and horizontal lines, ascending. */
  xs: number[];
  ys: number[];
  /** Deepest box of each cell (row major, `xs.length - 1` cells per row), -1 when free. */
  cells: number[];
}

const MARGIN = 40;
/** A bend costs this much more than the same length run straight. */
const BEND_COST = 60;
/** Ends sit near the middle of a side, not at a corner: each unit off-center costs this much. */
const CENTER_PULL = 0.2;
/** Weight of the distance still to go in the search: above 1, it hurries towards the target. */
const HEURISTIC_WEIGHT = 2;
/** States popped by a search before it gives up: the edge keeps its direct curve. */
const SEARCH_BUDGET = 3000;
/** Cells beyond which a layout gets no corridors (its edges keep their direct curves). */
const MAX_CELLS = 1_500_000;

function sortedUnique(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v !== sorted[i - 1]);
}

function indexOfLine(lines: number[], v: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function depthOf(parents: number[], i: number): number {
  let d = 0;
  for (let p = parents[i]; p >= 0; p = parents[p]) d++;
  return d;
}

/** The corridors between the boxes of a layout. */
export function buildCorridors(layout: MapLayout): Corridors {
  const ids = [...layout.nodes.keys()];
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const rects = new Array<number>(n * 4).fill(0);
  const parents = new Array<number>(n).fill(-1);
  const xValues: number[] = [];
  const yValues: number[] = [];
  const b = layout.bounds;
  xValues.push(b.x - MARGIN, b.x + b.w + MARGIN);
  yValues.push(b.y - MARGIN, b.y + b.h + MARGIN);
  ids.forEach((id, i) => {
    const node = layout.nodes.get(id)!;
    rects[i * 4] = node.x;
    rects[i * 4 + 1] = node.y;
    rects[i * 4 + 2] = node.w;
    rects[i * 4 + 3] = node.h;
    parents[i] = node.parent === null ? -1 : (index.get(node.parent) ?? -1);
    xValues.push(node.x, node.x + node.w);
    yValues.push(node.y, node.y + node.h);
  });
  const xs = sortedUnique(xValues);
  const ys = sortedUnique(yValues);
  const spans = new Array<number>(n * 4).fill(0);
  for (let i = 0; i < n; i++) {
    const x = rects[i * 4];
    const y = rects[i * 4 + 1];
    spans[i * 4] = indexOfLine(xs, x);
    spans[i * 4 + 1] = indexOfLine(xs, x + rects[i * 4 + 2]);
    spans[i * 4 + 2] = indexOfLine(ys, y);
    spans[i * 4 + 3] = indexOfLine(ys, y + rects[i * 4 + 3]);
  }
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols * rows > MAX_CELLS) {
    return {
      ids: [],
      rects: [],
      parents: [],
      spans: [],
      xs: [],
      ys: [],
      cells: [],
    };
  }
  const cells = new Array<number>(cols * rows).fill(-1);
  // Shallow boxes first, so that the deeper box has the last word on a cell.
  const order = Array.from({ length: n }, (_, i) => i);
  const depth = order.map((i) => depthOf(parents, i));
  order.sort((p, q) => depth[p] - depth[q]);
  for (const i of order) {
    const x0 = spans[i * 4];
    const x1 = spans[i * 4 + 1];
    const y0 = spans[i * 4 + 2];
    const y1 = spans[i * 4 + 3];
    for (let j = y0; j < y1; j++) cells.fill(i, j * cols + x0, j * cols + x1);
  }
  return { ids, rects, parents, spans, xs, ys, cells };
}

/** What a search reuses from one call to the next on the same corridors (never sent anywhere). */
interface Scratch {
  byId: Map<string, number>;
  /** Cost and predecessor of each state (cell and direction), valid when `seen` is `run`. */
  best: Float64Array;
  prev: Int32Array;
  seen: Int32Array;
  /** Per box: allowed for the current search when equal to `run`. */
  allowed: Int32Array;
  run: number;
  heapF: number[];
  heapV: number[];
  heapT: number[];
}

const scratches = new WeakMap<Corridors, Scratch>();

function scratchOf(c: Corridors): Scratch {
  let s = scratches.get(c);
  if (!s) {
    const states = (c.xs.length - 1) * (c.ys.length - 1) * 4;
    s = {
      byId: new Map(c.ids.map((id, i) => [id, i])),
      best: new Float64Array(states),
      prev: new Int32Array(states),
      seen: new Int32Array(states),
      allowed: new Int32Array(c.ids.length),
      run: 0,
      heapF: [],
      heapV: [],
      heapT: [],
    };
    scratches.set(c, s);
  }
  return s;
}

// Directions: 0 east, 1 south, 2 west, 3 north.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** A binary min-heap of `[priority, state, side]` entries, in the parallel arrays of a scratch. */
class Heap {
  constructor(
    private readonly f: number[],
    private readonly v: number[],
    private readonly t: number[],
  ) {
    f.length = 0;
    v.length = 0;
    t.length = 0;
  }

  get size(): number {
    return this.f.length;
  }

  push(f: number, v: number, t: number): void {
    let i = this.f.length;
    this.f.push(f);
    this.v.push(v);
    this.t.push(t);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= f) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Removes the top entry; its state and side are read from `top` right after. */
  top = { f: 0, v: 0, t: 0 };

  pop(): void {
    this.top.f = this.f[0];
    this.top.v = this.v[0];
    this.top.t = this.t[0];
    const f = this.f.pop()!;
    const v = this.v.pop()!;
    const t = this.t.pop()!;
    const n = this.f.length;
    if (n === 0) return;
    this.f[0] = f;
    this.v[0] = v;
    this.t[0] = t;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.f[l] < this.f[m]) m = l;
      if (r < n && this.f[r] < this.f[m]) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }

  private swap(a: number, b: number): void {
    const f = this.f[a];
    const v = this.v[a];
    const t = this.t[a];
    this.f[a] = this.f[b];
    this.v[a] = this.v[b];
    this.t[a] = this.t[b];
    this.f[b] = f;
    this.v[b] = v;
    this.t[b] = t;
  }
}

/**
 * The route, in world units, from the border of `fromId` to the border of `toId`: horizontal and
 * vertical segments through the free cells of the corridors, with the fewest bends for a short
 * length. It crosses no box but the ancestors of its ends. `null` when there is no corridor (an
 * unknown box, an end walled in, a search too long): the caller keeps the direct curve.
 */
export function routeEdge(c: Corridors, fromId: string, toId: string): RoutePoint[] | null {
  const sc = scratchOf(c);
  const from = sc.byId.get(fromId);
  const to = sc.byId.get(toId);
  if (from === undefined || to === undefined || from === to) return null;
  const { xs, ys, cells, parents } = c;
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const run = ++sc.run;
  // Boxes a route may cross: the ancestors of its ends (the ends themselves are walls).
  for (const end of [from, to]) {
    for (let p = parents[end]; p >= 0; p = parents[p]) {
      if (p === to || p === from) return null;
      sc.allowed[p] = run;
    }
  }
  const { allowed, best, prev, seen } = sc;
  const tx = c.rects[to * 4];
  const ty = c.rects[to * 4 + 1];
  const tw = c.rects[to * 4 + 2];
  const th = c.rects[to * 4 + 3];
  const fx = c.rects[from * 4];
  const fy = c.rects[from * 4 + 1];
  const fw = c.rects[from * 4 + 2];
  const fh = c.rects[from * 4 + 3];
  const [fx0, fx1, fy0, fy1] = [0, 1, 2, 3].map((k) => c.spans[from * 4 + k]);
  const [tx0, tx1, ty0, ty1] = [0, 1, 2, 3].map((k) => c.spans[to * 4 + k]);
  const tcx = tx + tw / 2;
  const tcy = ty + th / 2;
  const fcx = fx + fw / 2;
  const fcy = fy + fh / 2;
  const cx = (i: number): number => (xs[i] + xs[i + 1]) / 2;
  const cy = (j: number): number => (ys[j] + ys[j + 1]) / 2;
  const free = (cell: number): boolean => {
    const d = cells[cell];
    return d < 0 || allowed[d] === run;
  };
  // Weighted: a little longer than the shortest route is fine, and the search is much shorter.
  const heuristic = (x: number, y: number): number =>
    HEURISTIC_WEIGHT * (Math.max(tx - x, 0, x - tx - tw) + Math.max(ty - y, 0, y - ty - th));

  const startPoints = new Map<number, RoutePoint>();
  const heap = new Heap(sc.heapF, sc.heapV, sc.heapT);
  const start = (i: number, j: number, dir: number, border: RoutePoint): void => {
    const cell = j * cols + i;
    if (!free(cell)) return;
    const x = cx(i);
    const y = cy(j);
    const state = cell * 4 + dir;
    const g =
      Math.abs(x - border.x) +
      Math.abs(y - border.y) +
      CENTER_PULL * (Math.abs(border.x - fcx) + Math.abs(border.y - fcy));
    if (seen[state] === run && best[state] <= g) return;
    seen[state] = run;
    best[state] = g;
    prev[state] = -1;
    startPoints.set(state, border);
    heap.push(g + heuristic(x, y), state, -1);
  };
  for (let j = fy0; j < fy1; j++) {
    const y = cy(j);
    if (fx0 > 0) start(fx0 - 1, j, 2, { x: fx, y });
    if (fx1 < cols) start(fx1, j, 0, { x: fx + fw, y });
  }
  for (let i = fx0; i < fx1; i++) {
    const x = cx(i);
    if (fy0 > 0) start(i, fy0 - 1, 3, { x, y: fy });
    if (fy1 < rows) start(i, fy1, 1, { x, y: fy + fh });
  }

  let finalState = -1;
  let finalSide = -1;
  for (let pops = 0; heap.size > 0 && pops < SEARCH_BUDGET; pops++) {
    heap.pop();
    const { f, v: state, t: side } = heap.top;
    if (side >= 0) {
      finalState = state;
      finalSide = side;
      break;
    }
    const cell = state >> 2;
    const dir = state & 3;
    const i = cell % cols;
    const j = (cell - i) / cols;
    const x = cx(i);
    const y = cy(j);
    const g = best[state];
    if (f - heuristic(x, y) > g + 1e-9) continue;
    // A cell that touches `to` can end the route there, entering by that side.
    if (j >= ty0 && j < ty1) {
      if (i + 1 === tx0) end(0, tx - x, Math.abs(y - tcy));
      if (i === tx1) end(2, x - (tx + tw), Math.abs(y - tcy));
    }
    if (i >= tx0 && i < tx1) {
      if (j + 1 === ty0) end(1, ty - y, Math.abs(x - tcx));
      if (j === ty1) end(3, y - (ty + th), Math.abs(x - tcx));
    }
    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue;
      const ni = i + DX[d];
      const nj = j + DY[d];
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const next = nj * cols + ni;
      if (!free(next)) continue;
      const nx = cx(ni);
      const ny = cy(nj);
      const cost = g + Math.abs(nx - x) + Math.abs(ny - y) + (d === dir ? 0 : BEND_COST);
      const ns = next * 4 + d;
      if (seen[ns] === run && best[ns] <= cost) continue;
      seen[ns] = run;
      best[ns] = cost;
      prev[ns] = state;
      heap.push(cost + heuristic(nx, ny), ns, -1);
    }
    function end(s: number, leg: number, off: number): void {
      if (s === (dir + 2) % 4) return;
      heap.push(g + leg + CENTER_PULL * off + (s === dir ? 0 : BEND_COST), state, s);
    }
  }
  if (finalState < 0) return null;

  const points: RoutePoint[] = [];
  for (let s = finalState; s >= 0; s = prev[s]) {
    const cell = s >> 2;
    const i = cell % cols;
    points.push({ x: cx(i), y: cy((cell - i) / cols) });
    if (prev[s] === -1) points.push(startPoints.get(s)!);
  }
  points.reverse();
  const last = points[points.length - 1];
  points.push(
    finalSide === 0
      ? { x: tx, y: last.y }
      : finalSide === 2
        ? { x: tx + tw, y: last.y }
        : finalSide === 1
          ? { x: last.x, y: ty }
          : { x: last.x, y: ty + th },
  );
  // Drop the points in the middle of a straight run.
  const route: RoutePoint[] = [];
  for (const p of points) {
    const a = route[route.length - 1];
    if (a && a.x === p.x && a.y === p.y) continue;
    const b = route[route.length - 2];
    if (a && b && ((a.x === b.x && a.x === p.x) || (a.y === b.y && a.y === p.y))) route.pop();
    route.push(p);
  }
  return route.length >= 2 ? route : null;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** SVG path data of a route with rounded corners; the radius is capped to half of a segment. */
export function roundedPath(points: readonly RoutePoint[], radius: number): string {
  if (points.length === 0) return '';
  let d = `M${round(points[0].x)},${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const p = points[i];
    const q = points[i + 1];
    const inLen = Math.hypot(p.x - a.x, p.y - a.y);
    const outLen = Math.hypot(q.x - p.x, q.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (inLen === 0 || outLen === 0) continue;
    const bx = p.x - ((p.x - a.x) / inLen) * r;
    const by = p.y - ((p.y - a.y) / inLen) * r;
    const ex = p.x + ((q.x - p.x) / outLen) * r;
    const ey = p.y + ((q.y - p.y) / outLen) * r;
    d += `L${round(bx)},${round(by)}Q${round(p.x)},${round(p.y)} ${round(ex)},${round(ey)}`;
  }
  const end = points[points.length - 1];
  if (points.length > 1) d += `L${round(end.x)},${round(end.y)}`;
  return d;
}
