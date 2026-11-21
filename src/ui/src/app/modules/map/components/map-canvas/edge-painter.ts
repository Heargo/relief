// Canvas 2D painter of the map edges (ADR 0009), to parity with the SVG of `map-canvas.component`
// and its styles. No Angular: it draws the edges of a `MapScene`, shapes in world units under the
// camera (lines and dashes keep their screen thickness), labels in screen pixels.
import type { Camera } from '../../helpers/camera.logic';
import { edgeThickness } from '../../helpers/edges.logic';
import type { SceneEdge } from '../../helpers/map-scene.logic';
import type { Palette } from './map-painter';

const LINE_ALPHA = 0.75;
const REMOVED_ALPHA = 0.8;
const ARROW_ALPHA = 0.85;
const DIM_ALPHA = 0.12;
const MERGED_ALPHA = 0.6;
const COCHANGE_ALPHA = 0.85;
const OUT_WIDTH = 2.4;
const PICKED_WIDTH = 3;
const LABEL_FONT = '600 10.5px ui-sans-serif, system-ui';
const NO_DASH: number[] = [];

export function createEdgePainter(ctx: CanvasRenderingContext2D, palette: Palette) {
  const paths = new Map<string, Path2D>();
  /** The `Path2D` of a path string, made once. */
  const path = (d: string): Path2D => {
    let p = paths.get(d);
    if (!p) {
      if (paths.size > 20_000) paths.clear();
      paths.set(d, (p = new Path2D(d)));
    }
    return p;
  };

  // The merged edges change rarely: the union path is kept while their strings are the same.
  let mergedKey: string[] = [];
  let mergedPath: Path2D | null = null;
  const merged = (edges: SceneEdge[]): Path2D => {
    let same = mergedPath !== null && mergedKey.length === edges.length;
    for (let i = 0; same && i < edges.length; i++) same = mergedKey[i] === edges[i].shape.d;
    if (same && mergedPath) return mergedPath;
    mergedKey = edges.map((e) => e.shape.d);
    mergedPath = new Path2D();
    for (const e of edges) mergedPath.addPath(path(e.shape.d));
    return mergedPath;
  };
  const mergedList: SceneEdge[] = [];

  const statusColor = (e: SceneEdge): string | null =>
    e.status === 'added'
      ? palette.add
      : e.status === 'modified'
        ? palette.mod
        : e.status === 'removed'
          ? palette.del
          : e.status === 'moved'
            ? palette.mov
            : null;

  const colorOf = (e: SceneEdge): string => {
    if (e.emphasis === 'in') return palette.impact;
    if (e.emphasis === 'out' || e.emphasis === 'picked' || e.selected) return palette.accent;
    if (e.violation === 'new') return palette.rule;
    if (e.violation === 'old') return palette.ruleOld;
    return statusColor(e) ?? (e.impactPath ? palette.impact : palette.faint);
  };

  const dashOf = (e: SceneEdge, px: number): number[] => {
    if (e.violation === 'new' || e.status === 'added') return [7 * px, 4 * px];
    if (e.status === 'removed') return [3 * px, 4 * px];
    if (e.status === 'moved') return [2 * px, 5 * px];
    return NO_DASH;
  };

  const labelColor = (e: SceneEdge): string =>
    e.impactPath
      ? palette.impact
      : e.label.cls === 'add'
        ? palette.add
        : e.label.cls === 'del'
          ? palette.del
          : e.label.cls === 'viol'
            ? palette.rule
            : e.label.cls === 'violOld'
              ? palette.ruleOld
              : e.label.cls === 'mov'
                ? palette.mov
                : palette.muted;

  return {
    /** The edges, in world units (the context carries the camera transform). */
    lines(edges: readonly SceneEdge[], camera: Camera, selecting: boolean): void {
      const px = 1 / camera.scale;
      mergedList.length = 0;
      for (const e of edges) if (e.merged) mergedList.push(e);
      if (mergedList.length > 0) {
        ctx.globalAlpha = selecting ? DIM_ALPHA : MERGED_ALPHA;
        ctx.strokeStyle = palette.faint;
        ctx.lineWidth = px;
        ctx.setLineDash(NO_DASH);
        ctx.stroke(merged(mergedList));
      }
      for (const e of edges) {
        if (e.merged || e.emphasis === 'hidden') continue;
        const dim = e.emphasis === 'dim';
        if (e.coChange) {
          ctx.globalAlpha = COCHANGE_ALPHA;
          ctx.strokeStyle = palette.cochange;
          ctx.lineWidth = edgeThickness(e.count) * px;
          ctx.setLineDash([6 * px, 4 * px]);
          ctx.stroke(path(e.shape.d));
          continue;
        }
        const color = colorOf(e);
        const strong = e.selected || e.emphasis === 'out' || e.emphasis === 'in';
        const picked = e.emphasis === 'picked';
        ctx.globalAlpha = dim
          ? DIM_ALPHA
          : strong || picked
            ? 1
            : e.status === 'removed'
              ? REMOVED_ALPHA
              : LINE_ALPHA;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth =
          (picked
            ? PICKED_WIDTH
            : e.emphasis === 'out' || e.emphasis === 'in'
              ? OUT_WIDTH
              : edgeThickness(e.count)) * px;
        ctx.setLineDash(dashOf(e, px));
        ctx.stroke(path(e.shape.d));
        ctx.globalAlpha = dim ? DIM_ALPHA : ARROW_ALPHA;
        ctx.fill(path(e.shape.arrow));
      }
      ctx.setLineDash(NO_DASH);
      ctx.globalAlpha = 1;
    },

    /** The labels of the visible edges, in screen pixels. */
    labels(edges: readonly SceneEdge[], camera: Camera): void {
      const { scale: s, tx, ty } = camera;
      let set = false;
      for (const e of edges) {
        if (e.merged || e.coChange || !e.label.visible || e.emphasis === 'hidden') continue;
        if (!set) {
          set = true;
          ctx.font = LABEL_FONT;
          ctx.textAlign = 'center';
        }
        ctx.globalAlpha = e.emphasis === 'dim' ? DIM_ALPHA : e.label.cls === 'violOld' ? 0.8 : 1;
        ctx.fillStyle = labelColor(e);
        ctx.fillText(e.label.text, e.mid.x * s + tx, e.mid.y * s + ty);
      }
      if (set) ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    },
  };
}
