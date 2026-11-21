// TEMPORARY (until the edge painter of S18): the edge drawing of the spike, so that the Canvas
// map stays usable. It draws the `EdgeLine`s of the business, not the scene.
import type { EdgeLine } from '../../business/map.business';
import type { Camera } from '../../helpers/camera.logic';
import type { EdgeEmphasis, NodeEmphasis } from '../../helpers/emphasis.logic';
import type { Palette } from './map-painter';

export interface TempEdges {
  lines: readonly EdgeLine[];
  merged: readonly EdgeLine[];
  nodeEmphasis: ReadonlyMap<string, NodeEmphasis>;
  edgeEmphasis: ReadonlyMap<string, EdgeEmphasis>;
  edgeKey: (line: EdgeLine) => string;
}

const STATUS: Record<string, keyof Palette> = {
  added: 'add',
  modified: 'mod',
  removed: 'del',
  moved: 'mov',
  violation: 'rule',
};

export class TempEdgePainter {
  private readonly paths = new Map<string, Path2D>();

  private path(d: string): Path2D {
    let p = this.paths.get(d);
    if (!p) {
      p = new Path2D(d);
      if (this.paths.size > 20_000) this.paths.clear();
      this.paths.set(d, p);
    }
    return p;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, palette: Palette, scene: TempEdges): void {
    const px = 1 / camera.scale;
    ctx.globalAlpha = scene.nodeEmphasis.size > 0 ? 0.25 : 0.6;
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = px;
    const merged = new Path2D();
    for (const l of scene.merged) merged.addPath(this.path(l.shape.d));
    ctx.stroke(merged);
    for (const l of scene.lines) {
      const emphasis = scene.edgeEmphasis.get(scene.edgeKey(l));
      if (emphasis === 'hidden') continue;
      ctx.globalAlpha = emphasis === 'dim' ? 0.2 : 1;
      const picked = l.selected || emphasis === 'picked' || emphasis === 'out' || emphasis === 'in';
      const key = STATUS[l.status];
      const color = picked ? palette.accent : key ? palette[key] : palette.muted;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = (l.selected ? 2.5 : 1.25) * px;
      ctx.stroke(this.path(l.shape.d));
      ctx.fill(this.path(l.shape.arrow));
    }
    ctx.globalAlpha = 1;
  }
}
