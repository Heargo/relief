// PROTOTYPE (S14 spike, throwaway): alternative painters for the map, picked by `?renderer=`.
// `dom` (default) is today's DOM + SVG rendering. The painters only draw what `MapBusiness`
// already computes (visible nodes, edge lines, emphasis, camera): no logic of their own.
import type { EdgeLine, VisibleNode } from '../../business/map.business';
import type { Camera } from '../../helpers/camera.logic';
import type { EdgeEmphasis, NodeEmphasis } from '../../helpers/emphasis.logic';

export type ProtoKind = 'dom' | 'canvas' | 'webgl';

/** Read once at bundle load, before the router touches the URL. */
export const PROTO_RENDERER: ProtoKind = (() => {
  try {
    const value = new URLSearchParams(location.search).get('renderer');
    return value === 'canvas' || value === 'webgl' ? value : 'dom';
  } catch {
    return 'dom';
  }
})();

export interface ProtoScene {
  nodes: VisibleNode[];
  lines: EdgeLine[];
  merged: EdgeLine[];
  nodeEmphasis: ReadonlyMap<string, NodeEmphasis>;
  edgeEmphasis: ReadonlyMap<string, EdgeEmphasis>;
  edgeKey: (line: EdgeLine) => string;
  camera: Camera;
  width: number;
  height: number;
  label: (node: VisibleNode) => string;
}

export interface ProtoPainter {
  draw(scene: ProtoScene): void;
  destroy(): void;
}

export interface Palette {
  fg: string;
  muted: string;
  faint: string;
  line: string;
  line2: string;
  node: string;
  open: string;
  accent: string;
  status: Record<string, string>;
}

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(`--relief-${name}`).trim() || '#888';
  return {
    fg: v('fg'),
    muted: v('muted'),
    faint: v('faint'),
    line: v('line'),
    line2: v('line-2'),
    node: v('node'),
    open: v('node-open'),
    accent: v('accent'),
    status: {
      added: v('add'),
      modified: v('mod'),
      removed: v('del'),
      moved: v('mov'),
      violation: v('rule'),
    },
  };
}

/** Topmost (smallest) visible node under a world point. */
export function hitNode(nodes: VisibleNode[], x: number, y: number): VisibleNode | null {
  let best: VisibleNode | null = null;
  for (const n of nodes) {
    if (x < n.x || y < n.y || x > n.x + n.w || y > n.y + n.h) continue;
    if (!best || n.w * n.h < best.w * best.h) best = n;
  }
  return best;
}

/** Canvas 2D: one element, everything redrawn on each change. Text in screen space. */
export class Canvas2dPainter implements ProtoPainter {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly paths = new Map<string, Path2D>();
  private readonly palette = readPalette();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  private path(d: string): Path2D {
    let p = this.paths.get(d);
    if (!p) {
      p = new Path2D(d);
      if (this.paths.size > 20_000) this.paths.clear();
      this.paths.set(d, p);
    }
    return p;
  }

  draw(scene: ProtoScene): void {
    const { canvas, ctx, palette } = this;
    const dpr = devicePixelRatio || 1;
    const w = Math.round(scene.width * dpr);
    const h = Math.round(scene.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const { scale: s, tx, ty } = scene.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
    // The view in world units, for culling.
    const vx0 = -tx / s;
    const vy0 = -ty / s;
    const vx1 = (scene.width - tx) / s;
    const vy1 = (scene.height - ty) / s;
    const inView = (n: VisibleNode) => n.x < vx1 && n.y < vy1 && n.x + n.w > vx0 && n.y + n.h > vy0;
    const px = 1 / s;

    // Boxes: open containers first (they hold the others), then closed nodes.
    const shown: VisibleNode[] = [];
    for (const n of scene.nodes) if (inView(n)) shown.push(n);
    ctx.lineWidth = px;
    for (const pass of ['open', 'closed'] as const) {
      for (const n of shown) {
        if ((n.mode === 'open') !== (pass === 'open')) continue;
        const dim = scene.nodeEmphasis.get(n.id) === 'dim';
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.fillStyle = pass === 'open' ? palette.open : palette.node;
        ctx.fillRect(n.x, n.y, n.w, n.h);
        const status = n.mark?.status;
        ctx.strokeStyle = status && palette.status[status] ? palette.status[status] : palette.line2;
        ctx.lineWidth = status && status !== 'unchanged' ? 2 * px : px;
        ctx.strokeRect(n.x, n.y, n.w, n.h);
      }
    }

    // Edges: the common path in one stroke, the others one by one.
    ctx.globalAlpha = scene.nodeEmphasis.size > 0 ? 0.25 : 0.6;
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = px;
    ctx.beginPath();
    const merged = new Path2D();
    for (const l of scene.merged) merged.addPath(this.path(l.shape.d));
    ctx.stroke(merged);
    for (const l of scene.lines) {
      const emphasis = scene.edgeEmphasis.get(scene.edgeKey(l));
      if (emphasis === 'hidden') continue;
      ctx.globalAlpha = emphasis === 'dim' ? 0.2 : 1;
      const color =
        l.selected || emphasis === 'picked' || emphasis === 'out' || emphasis === 'in'
          ? palette.accent
          : (palette.status[l.status] ?? palette.muted);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = (l.selected ? 2.5 : 1.25) * px;
      ctx.stroke(this.path(l.shape.d));
      ctx.fill(this.path(l.shape.arrow));
    }

    // Text in screen pixels, so it stays sharp at every scale.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.fg;
    for (const n of shown) {
      const sw = n.w * s;
      const sh = n.h * s;
      if (sw < 36 || sh < 14) continue;
      const label = scene.label(n);
      if (!label) continue;
      const max = Math.floor((sw - 10) / 6.5);
      const text = label.length > max ? `${label.slice(0, Math.max(1, max - 1))}…` : label;
      const sx = n.x * s + tx + 5;
      const sy = n.mode === 'open' ? n.y * s + ty + 10 : n.y * s + ty + Math.min(sh / 2, 12);
      ctx.globalAlpha = scene.nodeEmphasis.get(n.id) === 'dim' ? 0.35 : 1;
      ctx.fillText(text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  destroy(): void {
    this.paths.clear();
  }
}
