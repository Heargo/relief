import { OPEN_THRESHOLDS } from './visibility.logic';
import type { MapLayout, Rect } from './layout.logic';

/** Screen position of a world point: `screen = world * scale + (tx, ty)`. */
export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ZoomBounds {
  min: number;
  max: number;
}

export function zoomAt(
  camera: Camera,
  factor: number,
  px: number,
  py: number,
  bounds: ZoomBounds,
): Camera {
  const scale = Math.max(bounds.min, Math.min(bounds.max, camera.scale * factor));
  const k = scale / camera.scale;
  return { scale, tx: px - (px - camera.tx) * k, ty: py - (py - camera.ty) * k };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { scale: camera.scale, tx: camera.tx + dx, ty: camera.ty + dy };
}

/** The camera that shows `center` (world) at the middle of the viewport at `scale`. */
export function cameraAt(scale: number, center: { x: number; y: number }, vp: Viewport): Camera {
  return { scale, tx: vp.width / 2 - center.x * scale, ty: vp.height / 2 - center.y * scale };
}

export function fitRect(
  rect: Rect,
  viewport: Viewport,
  options: { pad: number; maxScale: number },
): Camera {
  const { pad, maxScale } = options;
  const scale = Math.min(
    (viewport.width - pad * 2) / rect.w,
    (viewport.height - pad * 2) / rect.h,
    maxScale,
  );
  return cameraAt(scale, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, viewport);
}

export function cameraCenter(camera: Camera, viewport: Viewport): { x: number; y: number } {
  return {
    x: (viewport.width / 2 - camera.tx) / camera.scale,
    y: (viewport.height / 2 - camera.ty) / camera.scale,
  };
}

/** Zoom interpolated in log space, centre interpolated linearly: a steady-feeling animation. */
export function interpolateCamera(from: Camera, to: Camera, u: number, vp: Viewport): Camera {
  const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * u);
  const a = cameraCenter(from, vp);
  const b = cameraCenter(to, vp);
  return cameraAt(scale, { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, vp);
}

export function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function lowerMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Scale that makes the whole map fit with the margins of the "fit all" view. */
export function fitScale(layout: MapLayout, viewport: Viewport): number {
  const w = Math.max(200, viewport.width);
  const h = Math.max(200, viewport.height);
  if (layout.bounds.w <= 0 || layout.bounds.h <= 0) return 1;
  return Math.min((w * 0.9) / layout.bounds.w, (h * 0.88) / layout.bounds.h);
}

/**
 * Target scale of each level 0 to 3: the one at which the median container of that depth just
 * opens. Never decreasing, so a deeper level always shows at least what the previous one shows.
 */
export function levelScales(layout: MapLayout, viewport: Viewport): number[] {
  const all = [...layout.nodes.values()];
  const widths = (keep: (n: (typeof all)[number]) => boolean) =>
    lowerMedian(all.filter(keep).map((n) => n.w));
  const systems = widths(
    (n) => n.kind === 'service' || n.kind === 'package' || n.kind === 'workspace',
  );
  // A module that only groups externals is not a code module.
  const modules = widths(
    (n) =>
      n.kind === 'module' &&
      !(n.children.length > 0 && n.children.every((c) => layout.nodes.get(c)?.kind === 'external')),
  );
  const files = widths((n) => n.kind === 'file');

  const fit = fitScale(layout, viewport);
  const l1 = systems ? (OPEN_THRESHOLDS.system / systems) * 1.04 : fit * 2;
  const l3raw = files ? (OPEN_THRESHOLDS.file / files) * 1.06 : l1 * 2;
  const l2 = modules ? (OPEN_THRESHOLDS.module / modules) * 1.04 : Math.sqrt(l1 * l3raw);
  const l3 = Math.max(l3raw, l2);
  return [Math.min(fit, l1 * 0.85), l1, Math.max(l1, l2), Math.max(l1, l3)];
}

/** Deepest level whose scale is reached (3 % tolerance). */
export function currentLevel(scale: number, scales: number[]): number {
  let level = 0;
  scales.forEach((s, i) => {
    if (scale >= s * 0.97) level = i;
  });
  return level;
}

function distanceToRect(p: { x: number; y: number }, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Camera at `scale` for a level jump: it stays on the top-level box nearest to the current centre
 * (the one under it, when there is one); from the whole-map view it is the first box, the start of the map and shows its start (top-left, header included) when the
 * box is larger than the screen at that scale, or centres it when it fits.
 */
export function levelCamera(
  layout: MapLayout,
  camera: Camera,
  viewport: Viewport,
  scale: number,
  fromWholeMap = false,
): Camera {
  const center = cameraCenter(camera, viewport);
  const margin = 40;
  let best: Rect | null = null;
  let bestDistance = Infinity;
  for (const id of layout.roots) {
    const node = layout.nodes.get(id);
    if (!node || node.children.length === 0) continue;
    const distance = fromWholeMap ? 0 : distanceToRect(center, node);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  if (!best) return cameraAt(scale, center, viewport);
  const axis = (start: number, length: number, view: number): number =>
    length * scale + margin * 2 > view ? start + (view / 2 - margin) / scale : start + length / 2;
  return cameraAt(
    scale,
    { x: axis(best.x, best.w, viewport.width), y: axis(best.y, best.h, viewport.height) },
    viewport,
  );
}
