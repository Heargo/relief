// Canvas 2D painter of the map edges (ADR 0009). No Angular: it draws the edges of a `MapScene`, shapes in world units under the
// camera (lines and dashes keep their screen thickness), labels in screen pixels.
import type { Camera } from '../../helpers/camera.logic';
import { edgeThickness } from '../../helpers/edges.logic';
import type { SceneBundle, SceneEdge } from '../../helpers/map-scene.logic';
import type { Palette } from './map-painter';

const LINE_ALPHA = 0.75;
const REMOVED_ALPHA = 0.8;
const ARROW_ALPHA = 0.85;
const DIM_ALPHA = 0.12;
const MERGED_ALPHA = 0.6;
const COCHANGE_ALPHA = 0.85;
/** Alpha of what the step-by-step reading fades, for nodes and edges alike. */
export const STEP_FADED = 0.1;
const OUT_WIDTH = 2.4;
const PICKED_WIDTH = 3;
const TRUNK_WIDTH = 4;
const TRUNK_RIM = 2;
const LABEL_FONT = '600 10.5px ui-sans-serif, system-ui';
const HALO_WIDTH = 4;

export const NO_DASH: number[] = [];
const dashes = new Map<string, number[]>();
/** A dash pattern, one array per pattern (the camera scale changes rarely). */
export function dashed(on: number, off: number): number[] {
  const key = `${on}|${off}`;
  let d = dashes.get(key);
  if (!d) {
    if (dashes.size > 50) dashes.clear();
    dashes.set(key, (d = [on, off]));
  }
  return d;
}

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
    if (e.violation === 'new' || e.status === 'added') return dashed(7 * px, 4 * px);
    if (e.status === 'removed') return dashed(3 * px, 4 * px);
    if (e.status === 'moved') return dashed(2 * px, 5 * px);
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

  const statusOf = (status: SceneBundle['status']): string | null =>
    status === 'added'
      ? palette.add
      : status === 'modified'
        ? palette.mod
        : status === 'removed'
          ? palette.del
          : status === 'moved'
            ? palette.mov
            : null;

  const bundledIds = (bundles: readonly SceneBundle[]): Set<string> | null => {
    if (bundles.length === 0) return null;
    return new Set(bundles.map((b) => b.id));
  };

  /** One bundle: its branches, then its trunk (edged when the statuses are mixed). */
  const drawBundle = (
    b: SceneBundle,
    edgesByKey: ReadonlyMap<string, SceneEdge>,
    dim: boolean,
    px: number,
  ): void => {
    ctx.setLineDash(NO_DASH);
    for (const br of b.branches) {
      const e = edgesByKey.get(`${br.from}\u0000${br.to}`);
      const color = e ? colorOf(e) : (statusOf(b.status) ?? palette.faint);
      ctx.globalAlpha = (dim ? DIM_ALPHA : LINE_ALPHA) * (e?.faded ? STEP_FADED : 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = edgeThickness(e?.count ?? 1) * px;
      ctx.setLineDash(e ? dashOf(e, px) : NO_DASH);
      ctx.stroke(path(br.d));
    }
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha =
      (dim ? DIM_ALPHA : 1) *
      ((b.edges?.length ?? 0) > 0 &&
      b.edges.every((x) => edgesByKey.get(`${x.from}\u0000${x.to}`)?.faded)
        ? STEP_FADED
        : 1);
    const width = (TRUNK_WIDTH + edgeThickness(b.count) / 2) * px;
    const color = b.selected ? palette.accent : (statusOf(b.status) ?? palette.faint);
    if (b.mixed) {
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = width + TRUNK_RIM * px;
      ctx.stroke(path(b.trunk.d));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(path(b.trunk.d));
  };

  const drawEdge = (e: SceneEdge, px: number): void => {
    const dim = e.emphasis === 'dim';
    const fade = e.faded ? STEP_FADED : 1;
    if (e.coChange) {
      ctx.globalAlpha = COCHANGE_ALPHA * fade;
      ctx.strokeStyle = palette.cochange;
      ctx.lineWidth = edgeThickness(e.count) * px;
      ctx.setLineDash(dashed(6 * px, 4 * px));
      ctx.stroke(path(e.shape.d));
      return;
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
    ctx.globalAlpha *= fade;
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
    ctx.globalAlpha = (dim ? DIM_ALPHA : ARROW_ALPHA) * fade;
    ctx.fill(path(e.shape.arrow));
  };

  const alone: SceneEdge[] = [];

  return {
    /**
     * The edges, in world units (the context carries the camera transform). A bundle is its
     * branches and trunk; an edge of a bundle that is hovered or selected is drawn alone, whole,
     * after everything else.
     */
    lines(
      edges: readonly SceneEdge[],
      camera: Camera,
      selecting: boolean,
      bundles: readonly SceneBundle[] = [],
    ): void {
      const px = 1 / camera.scale;
      const known = bundledIds(bundles);
      const inBundle = (e: SceneEdge): boolean =>
        known !== null && !!e.bundle && known.has(e.bundle);
      mergedList.length = 0;
      for (const e of edges) if (e.merged && !inBundle(e)) mergedList.push(e);
      if (mergedList.length > 0) {
        ctx.globalAlpha = selecting ? DIM_ALPHA : MERGED_ALPHA;
        ctx.strokeStyle = palette.faint;
        ctx.lineWidth = px;
        ctx.setLineDash(NO_DASH);
        ctx.stroke(merged(mergedList));
      }
      alone.length = 0;
      if (known) {
        const byKey = new Map<string, SceneEdge>();
        const sharp = new Set<string>();
        const seen = new Set<string>();
        for (const e of edges) {
          if (!inBundle(e)) continue;
          byKey.set(`${e.from}\u0000${e.to}`, e);
          seen.add(e.bundle as string);
          if (e.emphasis !== 'dim') sharp.add(e.bundle as string);
          if (!e.merged && !e.coChange && (e.hovered || e.selected) && e.emphasis !== 'hidden')
            alone.push(e);
        }
        for (const b of bundles) {
          drawBundle(b, byKey, selecting && seen.has(b.id) && !sharp.has(b.id), px);
        }
      }
      for (const e of edges) {
        if (e.merged || e.emphasis === 'hidden' || inBundle(e)) continue;
        drawEdge(e, px);
      }
      for (const e of alone) drawEdge(e, px);
      ctx.setLineDash(NO_DASH);
      ctx.globalAlpha = 1;
    },

    /** The labels of the visible edges, in screen pixels. */
    labels(
      edges: readonly SceneEdge[],
      camera: Camera,
      bundles: readonly SceneBundle[] = [],
    ): void {
      const { scale: s, tx, ty } = camera;
      let set = false;
      for (const b of bundles) {
        if (!set) {
          set = true;
          ctx.font = LABEL_FONT;
          ctx.textAlign = 'center';
          ctx.lineWidth = HALO_WIDTH;
          ctx.lineJoin = 'round';
        }
        ctx.globalAlpha = 1;
        const lx = b.mid.x * s + tx;
        const ly = b.mid.y * s + ty;
        ctx.strokeStyle = palette.map;
        ctx.strokeText(b.label.text, lx, ly);
        ctx.fillStyle = b.selected ? palette.accent : (statusOf(b.status) ?? palette.muted);
        ctx.fillText(b.label.text, lx, ly);
      }
      for (const e of edges) {
        if (e.merged || e.coChange || !e.label.visible || e.emphasis === 'hidden') continue;
        if (!set) {
          set = true;
          ctx.font = LABEL_FONT;
          ctx.textAlign = 'center';
          ctx.lineWidth = HALO_WIDTH;
          ctx.lineJoin = 'round';
        }
        ctx.globalAlpha = e.faded
          ? STEP_FADED
          : e.emphasis === 'dim'
            ? DIM_ALPHA
            : e.label.cls === 'violOld'
              ? 0.8
              : 1;
        const lx = e.mid.x * s + tx;
        const ly = e.mid.y * s + ty;
        ctx.strokeStyle = palette.map;
        ctx.strokeText(e.label.text, lx, ly);
        ctx.fillStyle = labelColor(e);
        ctx.fillText(e.label.text, lx, ly);
      }
      if (set) {
        ctx.textAlign = 'start';
        ctx.lineJoin = 'miter';
      }
      ctx.globalAlpha = 1;
    },
  };
}
