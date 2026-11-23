import type { Camera, Viewport } from './camera.logic';
import type { MapLayout } from './layout.logic';
import { computeModes } from './visibility.logic';

/** The camera stays still for this long (ms): the gesture is over, the map is at rest. */
export const REST_DELAY_MS = 120;

/** The one CSS transform that carries the camera: world coordinates in, screen pixels out. */
export function layerTransform(camera: Camera): string {
  return `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.scale})`;
}

/**
 * Whether the modes (open, box, ghost), headers and edge shapes are to be computed again for
 * `camera`, which they were last computed for at `modesCamera`. A pan never asks for it. A zoom
 * waits for the rest, unless a container crosses its opening threshold on the way.
 */
export function shouldRecomputeModes(
  layout: MapLayout,
  modesCamera: Camera,
  camera: Camera,
  idleMs: number,
  maxLevel = 3,
): boolean {
  if (camera.scale === modesCamera.scale) return false;
  if (idleMs >= REST_DELAY_MS) return true;
  const before = computeModes(layout, modesCamera, maxLevel);
  const after = computeModes(layout, camera, maxLevel);
  for (const [id, mode] of after) if (before.get(id) !== mode) return true;
  return false;
}

/**
 * Whether the view at `camera` shows something outside what was rendered for `rendered` (the view
 * of that camera plus `margin` screen pixels around): the culling is to be done again.
 */
export function viewLeavesRenderedArea(
  rendered: Camera,
  camera: Camera,
  viewport: Viewport,
  margin: number,
): boolean {
  const left = (-rendered.tx - margin) / rendered.scale;
  const top = (-rendered.ty - margin) / rendered.scale;
  const right = (viewport.width - rendered.tx + margin) / rendered.scale;
  const bottom = (viewport.height - rendered.ty + margin) / rendered.scale;
  const viewLeft = -camera.tx / camera.scale;
  const viewTop = -camera.ty / camera.scale;
  const viewRight = (viewport.width - camera.tx) / camera.scale;
  const viewBottom = (viewport.height - camera.ty) / camera.scale;
  return viewLeft < left || viewTop < top || viewRight > right || viewBottom > bottom;
}
