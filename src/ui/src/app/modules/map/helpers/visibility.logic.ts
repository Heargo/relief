import type { NodeKind } from '../../../core/models/contract';
import type { Camera, Viewport } from './camera.logic';
import type { MapLayout, Rect } from './layout.logic';

export type NodeMode = 'open' | 'box' | 'ghost' | 'hidden';

/** On-screen width from which a container opens, per kind. */
export const OPEN_THRESHOLDS = { system: 470, module: 300, file: 175 } as const;

/** On-screen width from which a repository of a workspace opens. */
const REPO_OPEN_THRESHOLD = 400;

/** Level (1 to 3) at which each container kind opens. */
const OPEN_LEVEL = { repo: 1, system: 1, module: 2, file: 3 } as const;

type OpenKey = keyof typeof OPEN_LEVEL;

function thresholdOf(key: OpenKey): number {
  return key === 'repo' ? REPO_OPEN_THRESHOLD : OPEN_THRESHOLDS[key];
}

function openKey(kind: NodeKind): OpenKey | null {
  switch (kind) {
    case 'repo':
      return 'repo';
    case 'service':
    case 'package':
    case 'workspace':
      return 'system';
    case 'module':
      return 'module';
    case 'file':
      return 'file';
    default:
      return null;
  }
}

/** Level of the map (0 to 3) at which a node of this kind is the deepest one opened. */
export function levelOfKind(kind: NodeKind): number {
  const key = openKey(kind);
  return key ? OPEN_LEVEL[key] : 3;
}

/**
 * Semantic zoom: a container opens when its on-screen width reaches the threshold of its kind; a closed container shows its children
 * as ghosts and nothing deeper. `maxLevel` caps the depth (a container whose level is above it
 * stays closed).
 */
export function computeModes(
  layout: MapLayout,
  camera: Camera,
  maxLevel = 3,
): Map<string, NodeMode> {
  const modes = new Map<string, NodeMode>();
  const visit = (id: string, parent: 'full' | 'ghost' | 'hidden'): void => {
    const node = layout.nodes.get(id);
    if (!node) return;
    let childContext: 'full' | 'ghost' | 'hidden' = 'hidden';
    if (parent === 'full') {
      const key = openKey(node.kind);
      const opens =
        key !== null &&
        node.children.length > 0 &&
        OPEN_LEVEL[key] <= maxLevel &&
        node.w * camera.scale >= thresholdOf(key) - 1e-9;
      if (opens) {
        modes.set(id, 'open');
        childContext = 'full';
      } else {
        modes.set(id, 'box');
        childContext = node.children.length > 0 ? 'ghost' : 'hidden';
      }
    } else {
      modes.set(id, parent === 'ghost' ? 'ghost' : 'hidden');
    }
    for (const child of node.children) visit(child, childContext);
  };
  for (const root of layout.roots) visit(root, 'full');
  return modes;
}

/** Whether a world rect intersects the screen. */
export function isInViewport(rect: Rect, camera: Camera, viewport: Viewport): boolean {
  const x = rect.x * camera.scale + camera.tx;
  const y = rect.y * camera.scale + camera.ty;
  return (
    x < viewport.width &&
    y < viewport.height &&
    x + rect.w * camera.scale > 0 &&
    y + rect.h * camera.scale > 0
  );
}
