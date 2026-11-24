import { nearestEdge } from './edge-culling.logic';
import type { MapScene } from './map-scene.logic';

/** Distance, in screen pixels, within which a point picks an edge. */
const EDGE_REACH_PX = 6;

export type MapHit =
  | { kind: 'label'; from: string; to: string }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; from: string; to: string }
  | { kind: 'bundle'; id: string };

const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * What is under a world point: an edge label, else the smallest node, else the trunk of a bundle
 * within reach (outside any node), else the edge within reach (merged ones included; a bundled edge counts on its
 * branch), else nothing.
 */
export function hitTest(
  scene: MapScene,
  point: { x: number; y: number },
  scale: number,
): MapHit | null {
  for (const e of scene.edges) {
    if (e.labelRect && !e.shape.covered && inside(e.labelRect, point.x, point.y))
      return { kind: 'label', from: e.from, to: e.to };
  }
  let best: { id: string; area: number } | null = null;
  for (const n of scene.nodes) {
    if (!inside(n.rect, point.x, point.y)) continue;
    const area = n.rect.w * n.rect.h;
    if (!best || area < best.area) best = { id: n.id, area };
  }
  const reach = EDGE_REACH_PX / Math.abs(scale);
  const bundles = scene.bundles ?? [];
  const trunk = nearestEdge(
    bundles.map((b) => ({ d: b.trunk.d, id: b.id })),
    point,
    reach,
  );
  // The trunk loses to a box seen as a target; an open container shows its inside, the trunk wins.
  const onTarget = scene.nodes.some((n) => n.mode !== 'open' && inside(n.rect, point.x, point.y));
  if (trunk && !onTarget) return { kind: 'bundle', id: trunk.id };
  const branches = new Map<string, string>();
  for (const b of bundles)
    for (const br of b.branches) branches.set(`${br.from}\u0000${br.to}`, br.d);
  const near = nearestEdge(
    scene.edges.map((e) => ({
      d: (e.bundle ? branches.get(`${e.from}\u0000${e.to}`) : undefined) ?? e.shape.d,
      from: e.from,
      to: e.to,
    })),
    point,
    reach,
  );
  if (near) return { kind: 'edge', from: near.from, to: near.to };
  return best ? { kind: 'node', id: best.id } : null;
}
