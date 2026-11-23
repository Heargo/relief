import type { DiffStatus } from '../../review/helpers/diff-layer.logic';
import type { Rect } from './layout.logic';

/** Edges into (or out of) the same box by the same side start a bundle from this many. */
export const BUNDLE_MIN = 3;
/** Length, in world units, of the trunk shared by the edges of a bundle. */
export const BUNDLE_TRUNK_LENGTH = 40;

export type BundleSide = 'top' | 'right' | 'bottom' | 'left';
export type BundleEnd = 'in' | 'out';

export interface BundleInput {
  from: string;
  to: string;
  status: DiffStatus;
}

export interface BundlePoint {
  x: number;
  y: number;
}

export interface BundleBranch {
  from: string;
  to: string;
  /** SVG path data (a quadratic), world units. */
  d: string;
}

export interface EdgeBundle {
  /** `in:<box>:<side>` or `out:<box>:<side>`. */
  id: string;
  box: string;
  side: BundleSide;
  end: BundleEnd;
  count: number;
  /** Number of new edges (review). */
  added: number;
  /** Majority status; a change wins a tie. */
  status: DiffStatus;
  mixed: boolean;
  port: BundlePoint;
  /** From the end of the stub to the port (`in`), or from the port to the stub (`out`). */
  trunk: { from: BundlePoint; to: BundlePoint; d: string };
  mid: BundlePoint;
  branches: BundleBranch[];
}

/** The side of `box` that faces `other`, the axes weighted by the half-size of the box. */
export function entrySide(box: Rect, other: Rect): BundleSide {
  const dx = other.x + other.w / 2 - (box.x + box.w / 2);
  const dy = other.y + other.h / 2 - (box.y + box.h / 2);
  if (Math.abs(dx) / (box.w / 2) >= Math.abs(dy) / (box.h / 2)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

/** The middle of a side of a box. */
export function portPoint(box: Rect, side: BundleSide): BundlePoint {
  switch (side) {
    case 'left':
      return { x: box.x, y: box.y + box.h / 2 };
    case 'right':
      return { x: box.x + box.w, y: box.y + box.h / 2 };
    case 'top':
      return { x: box.x + box.w / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.w / 2, y: box.y + box.h };
  }
}

const OUTWARD: Record<BundleSide, BundlePoint> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

const num = (n: number): string => String(Math.round(n * 100) / 100 + 0);
const quad = (a: BundlePoint, b: BundlePoint): string =>
  `M${num(a.x)},${num(a.y)}Q${num((a.x + b.x) / 2)},${num((a.y + b.y) / 2)} ${num(b.x)},${num(b.y)}`;

/** Where the segment from the center of `box` to `toward` leaves the box. */
function borderPoint(box: Rect, toward: BundlePoint): BundlePoint {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const tx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Change statuses, by priority when they tie. */
const STATUS_ORDER: DiffStatus[] = ['added', 'removed', 'modified', 'moved', 'unchanged'];

function majority(statuses: readonly DiffStatus[]): { status: DiffStatus; mixed: boolean } {
  const counts = new Map<DiffStatus, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: DiffStatus = 'unchanged';
  let bestCount = -1;
  for (const s of STATUS_ORDER) {
    const n = counts.get(s) ?? 0;
    if (n > bestCount) {
      best = s;
      bestCount = n;
    }
  }
  return { status: best, mixed: counts.size > 1 };
}

interface Candidate {
  id: string;
  box: string;
  side: BundleSide;
  end: BundleEnd;
  edges: BundleInput[];
}

/**
 * Edges that enter (or leave) a box by the same side, from `BUNDLE_MIN` of them, share a trunk.
 * An edge is in one bundle only: the largest takes it, the others lose it. Deterministic.
 */
export function bundleEdges(
  edges: readonly BundleInput[],
  rects: ReadonlyMap<string, Rect>,
): EdgeBundle[] {
  const candidates = new Map<string, Candidate>();
  const add = (id: string, box: string, side: BundleSide, end: BundleEnd, edge: BundleInput) => {
    let c = candidates.get(id);
    if (!c) candidates.set(id, (c = { id, box, side, end, edges: [] }));
    c.edges.push(edge);
  };
  const sorted = [...edges].sort((a, b) =>
    a.from === b.from ? (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) : a.from < b.from ? -1 : 1,
  );
  for (const edge of sorted) {
    const a = rects.get(edge.from);
    const b = rects.get(edge.to);
    if (!a || !b || edge.from === edge.to) continue;
    const inSide = entrySide(b, a);
    add(`in:${edge.to}:${inSide}`, edge.to, inSide, 'in', edge);
    const outSide = entrySide(a, b);
    add(`out:${edge.from}:${outSide}`, edge.from, outSide, 'out', edge);
  }

  const taken = new Set<BundleInput>();
  const chosen: { candidate: Candidate; edges: BundleInput[] }[] = [];
  const pending = [...candidates.values()];
  for (;;) {
    let best: { candidate: Candidate; edges: BundleInput[] } | null = null;
    for (const candidate of pending) {
      const free = candidate.edges.filter((e) => !taken.has(e));
      if (free.length < BUNDLE_MIN) continue;
      if (
        !best ||
        free.length > best.edges.length ||
        (free.length === best.edges.length && candidate.id < best.candidate.id)
      )
        best = { candidate, edges: free };
    }
    if (!best) break;
    for (const e of best.edges) taken.add(e);
    chosen.push(best);
    pending.splice(pending.indexOf(best.candidate), 1);
  }

  return chosen
    .map(({ candidate, edges: members }) => build(candidate, members, rects))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function build(
  candidate: Candidate,
  members: readonly BundleInput[],
  rects: ReadonlyMap<string, Rect>,
): EdgeBundle {
  const { box, side, end } = candidate;
  const boxRect = rects.get(box) as Rect;
  const port = portPoint(boxRect, side);
  const out = OUTWARD[side];
  const stub = {
    x: port.x + out.x * BUNDLE_TRUNK_LENGTH,
    y: port.y + out.y * BUNDLE_TRUNK_LENGTH,
  };
  const trunk =
    end === 'in'
      ? { from: stub, to: port, d: quad(stub, port) }
      : { from: port, to: stub, d: quad(port, stub) };
  const branches: BundleBranch[] = members.map((e) => {
    const otherId = end === 'in' ? e.from : e.to;
    const other = rects.get(otherId) as Rect;
    const edge = borderPoint(other, stub);
    return { from: e.from, to: e.to, d: end === 'in' ? quad(edge, stub) : quad(stub, edge) };
  });
  const { status, mixed } = majority(members.map((e) => e.status));
  return {
    id: candidate.id,
    box,
    side,
    end,
    count: members.length,
    added: members.filter((e) => e.status === 'added').length,
    status,
    mixed,
    port,
    trunk,
    mid: { x: (stub.x + port.x) / 2, y: (stub.y + port.y) / 2 },
    branches,
  };
}
