// Canvas 2D painter of the map nodes (ADR 0009). No Angular: it draws a `MapScene` on a context,
// shapes in world units under the camera, text in screen pixels.
import type { Camera } from '../../helpers/camera.logic';
import { createEdgePainter, dashed, NO_DASH } from './edge-painter';
import { headerFontSize } from '../../helpers/header.logic';
import {
  closedFontPx,
  labelFont,
  TAB_FONT_CSS,
  type MapScene,
  type SceneNode,
  type SceneRect,
} from '../../helpers/map-scene.logic';

export interface Palette {
  fg: string;
  muted: string;
  faint: string;
  line: string;
  line2: string;
  node: string;
  nodeOpen: string;
  panel: string;
  accent: string;
  add: string;
  mod: string;
  del: string;
  mov: string;
  rule: string;
  impact: string;
  cochange: string;
  ruleOld: string;
  /** The color of the map background, the halo of the edge labels. */
  map: string;
}

const VARIABLES: Record<keyof Palette, string> = {
  fg: '--relief-fg',
  muted: '--relief-muted',
  faint: '--relief-faint',
  line: '--relief-line',
  line2: '--relief-line-2',
  node: '--relief-node',
  nodeOpen: '--relief-node-open',
  panel: '--relief-panel',
  accent: '--relief-accent',
  add: '--relief-add',
  mod: '--relief-mod',
  del: '--relief-del',
  mov: '--relief-mov',
  rule: '--relief-rule',
  impact: '--relief-impact',
  cochange: '--relief-cochange',
  ruleOld: '--relief-rule-old',
  map: '--relief-map',
};

/** The colors of the theme, read from the `--relief-*` variables. */
export function readPalette(style: { getPropertyValue(name: string): string }): Palette {
  const palette = {} as Palette;
  for (const key of Object.keys(VARIABLES) as (keyof Palette)[]) {
    palette[key] = style.getPropertyValue(VARIABLES[key]).trim();
  }
  return palette;
}

export interface PainterOptions {
  /** Translates the texts the scene only names (badges, counts). */
  t?: (key: string, params?: Record<string, unknown>) => string;
  /** Glyph of the icon font of a node, if it has one. */
  icon?: (id: string) => string | null;
  /** Colors of the risk steps, indexed by step (0 is unused). */
  risk?: readonly string[];
}

export interface Viewport {
  width: number;
  height: number;
}

export const ICON_FONT = "11px 'openng-icons'";

const SUB_FONT = 11;
const subFonts = new Map<number, string>();
function subFont(px: number): string {
  let font = subFonts.get(px);
  if (!font) subFonts.set(px, (font = `${px}px sans-serif`));
  return font;
}
const BADGE_FONT = '600 9.5px sans-serif';
const INTENSITY = [0, 0.1, 0.2, 0.32];
const FADED = 0.2;
const IMPACT_DIM = 0.3;
const EMPHASIS_DIM = 0.35;
const SEEN = 0.45;
const TEST_DIM = 0.55;
const OLD_LOCATION = 0.75;
const RISK_TINT = 0.32;
const BOX_RADIUS = 6;
const TAB_RADIUS = 4;
/** Height of the content row of a closed box, by kind (symbols use the whole box). */
const CLOSED_ROW: Record<string, number> = { service: 38, package: 38, workspace: 38, module: 30 };

function padding(kind: string): number {
  if (kind === 'service' || kind === 'package' || kind === 'workspace') return 14;
  return kind === 'module' ? 10 : 8;
}

export function createMapPainter(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  options: PainterOptions = {},
) {
  const t =
    options.t ??
    ((key: string, params?: Record<string, unknown>) =>
      Object.values(params ?? {}).join(' ') || key);

  const statusColor = (status: SceneNode['status']): string | null =>
    status === 'added'
      ? palette.add
      : status === 'modified'
        ? palette.mod
        : status === 'removed'
          ? palette.del
          : status === 'moved'
            ? palette.mov
            : null;

  const alphaOf = (n: SceneNode): number => {
    let a = 1;
    if (n.faded) a *= FADED;
    if (n.test) a *= TEST_DIM;
    if (n.impact === 'dim') a *= IMPACT_DIM;
    if (n.emphasis === 'dim') a *= EMPHASIS_DIM;
    if (n.reading?.seen) a *= SEEN;
    if (n.oldLocation) a *= OLD_LOCATION;
    return a;
  };

  const widths = new Map<string, number>();
  /** Width of `text` in `font`, measured once. */
  const measure = (font: string, text: string): number => {
    const key = `${font}\0${text}`;
    let w = widths.get(key);
    if (w === undefined) {
      if (widths.size > 20_000) widths.clear();
      ctx.font = font;
      w = ctx.measureText(text).width;
      widths.set(key, w);
    }
    return w;
  };
  const fits = new Map<string, string>();
  /** The longest start of `text` that fits `max` px with an ellipsis. */
  const fit = (font: string, text: string, max: number): string => {
    if (max <= 0) return '';
    if (measure(font, text) <= max) return text;
    const key = `${font}\0${Math.round(max)}\0${text}`;
    const known = fits.get(key);
    if (known !== undefined) return known;
    let lo = 0;
    let hi = text.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measure(font, `${text.slice(0, mid)}…`) <= max) lo = mid;
      else hi = mid - 1;
    }
    const out = `${text.slice(0, Math.max(1, lo))}…`;
    if (fits.size > 5_000) fits.clear();
    fits.set(key, out);
    return out;
  };

  function boxes(n: SceneNode, px: number): void {
    const { x, y, w, h } = n.rect;
    const open = n.mode === 'open';
    const ghost = n.mode === 'ghost';
    const color = statusColor(n.status);
    const marked = !n.oldLocation && n.status !== null && n.status !== 'unchanged' && color;
    const tint = marked ? (INTENSITY[n.intensity ?? 0] ?? 0) : 0;
    const base = alphaOf(n);
    const radius = BOX_RADIUS * px;
    ctx.globalAlpha = base;
    round(x, y, w, h, radius);
    if (ghost) {
      ctx.fillStyle = marked ? color : palette.faint;
      ctx.globalAlpha = base * (marked ? Math.min(1, tint + 0.25) : 0.16);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (!n.oldLocation) {
      ctx.fillStyle = open && n.kind !== 'file' ? palette.nodeOpen : palette.node;
      ctx.fill();
    }
    if (marked) {
      ctx.fillStyle = color;
      ctx.globalAlpha = base * (open ? (n.kind === 'file' ? 0.05 : 0) : tint);
      if (ctx.globalAlpha > 0) ctx.fill();
      ctx.globalAlpha = base;
      // The accent bar follows the rounded corners.
      ctx.save();
      ctx.clip();
      if (open) ctx.fillRect(x, y, w, 3 * px);
      else ctx.fillRect(x, y, 3 * px, h);
      ctx.restore();
    }
    const risk = n.risk ? options.risk?.[n.risk] : undefined;
    if (risk) {
      ctx.fillStyle = risk;
      ctx.globalAlpha = base * RISK_TINT;
      ctx.fill();
      ctx.globalAlpha = base;
    }
    ctx.strokeStyle = risk ?? palette.line2;
    ctx.lineWidth = px;
    ctx.setLineDash(NO_DASH);
    if (n.oldLocation) {
      ctx.strokeStyle = palette.mov;
      ctx.setLineDash(dashed(4 * px, 3 * px));
    } else if (n.impact === 'hit') {
      ctx.strokeStyle = palette.impact;
      ctx.lineWidth = 2 * px;
      ctx.setLineDash(dashed(4 * px, 3 * px));
    } else if (marked) {
      ctx.strokeStyle = color;
      if (n.status === 'removed') ctx.setLineDash(dashed(4 * px, 3 * px));
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = 1;
  }

  /** A rounded rectangle path (`roundRect`, or arcs where the engine lacks it). */
  function round(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function pill(text: string, x: number, cy: number, kind: string, color?: string): number {
    const w = measure(BADGE_FONT, text) + 8;
    const accent =
      kind === 'api' || kind === 'internal-signature'
        ? palette.mod
        : kind === 'breaking-api'
          ? palette.del
          : kind === 'archi'
            ? palette.rule
            : null;
    const solid = kind === 'archi' || kind === 'breaking-api';
    const top = cy - 7;
    if (accent) {
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * (solid ? 1 : 0.25);
      ctx.fillStyle = accent;
      round(x, top, w, 14, 3);
      ctx.fill();
      ctx.globalAlpha = alpha;
    } else {
      ctx.fillStyle = palette.panel;
      round(x, top, w, 14, 3);
      ctx.fill();
      ctx.strokeStyle = palette.line2;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.font = BADGE_FONT;
    ctx.fillStyle = color ?? (solid ? '#fff' : (accent ?? palette.muted));
    ctx.fillText(text, x + 4, cy);
    return w;
  }

  /** Icon, title, sub, badges and chips of a node, on the row centered on `cy` (screen pixels). */
  function row(n: SceneNode, sx: number, sw: number, cy: number, fontPx: number): void {
    const pad = padding(n.kind);
    let x = sx + pad;
    const right = sx + sw - pad;
    const subPx = Math.min(SUB_FONT, fontPx);
    const sub = subFont(subPx);
    const icon = options.icon?.(n.id);
    if (icon) {
      ctx.font = ICON_FONT;
      ctx.fillStyle = palette.accent;
      ctx.fillText(icon, x, cy);
      x += measure(ICON_FONT, icon) + 6;
    }
    if (n.label) {
      const font = labelFont(n.kind, fontPx);
      const text = n.labelClipped ? fit(font, n.label, right - x) : n.label;
      ctx.font = font;
      ctx.fillStyle = n.oldLocation ? palette.mov : palette.fg;
      ctx.fillText(text, x, cy);
      const width = measure(font, text);
      if (n.status === 'removed') ctx.fillRect(x, cy, width, 1);
      x += width + 6;
    }
    if (n.sub && x < right) {
      ctx.font = sub;
      ctx.fillStyle = palette.muted;
      ctx.fillText(n.sub, x, cy);
      x += measure(sub, n.sub) + 6;
    }
    const badges: [string, string, string?][] = n.badges.map((b) => [b, t(`review.badges.${b}`)]);
    if (n.impact === 'box' && n.impactCount > 0)
      badges.push([
        'imp-count',
        t('review.impact.boxCount', { count: n.impactCount }),
        palette.impact,
      ]);
    if (n.reading?.count && n.mode === 'box')
      badges.push(['seen-count', t('review.reading.counts', { ...n.reading.count })]);
    if (n.repeated)
      badges.push(['repeated', t('review.repeated.identical', { count: n.repeated.count })]);
    if (n.flagged) badges.push(['archi', t('rules.badge')]);
    if (n.loading) badges.push(['loading', t('map.loading')]);
    // Chips sit on the right; the rest flows from the left while there is room.
    let chipsLeft = right;
    ctx.font = sub;
    ctx.fillStyle = palette.muted;
    for (let i = n.counts.length - 1; i >= 0; i--) {
      const { unit, value } = n.counts[i];
      const text = t(`map.counts.${unit}${value === 1 ? '_one' : ''}`, { count: value });
      const width = measure(sub, text);
      if (chipsLeft - width < x) break;
      chipsLeft -= width;
      ctx.fillText(text, chipsLeft, cy);
      chipsLeft -= 8;
    }
    for (const [kind, text, color] of badges) {
      if (x + measure(BADGE_FONT, text) + 8 > chipsLeft) break;
      x += pill(text, x, cy, kind, color) + 6;
    }
  }

  function texts(n: SceneNode, camera: Camera): void {
    const { scale: s, tx, ty } = camera;
    const sx = n.rect.x * s + tx;
    const sy = n.rect.y * s + ty;
    const sw = n.rect.w * s;
    const sh = n.rect.h * s;
    ctx.globalAlpha = alphaOf(n);
    if (n.header === 'tab' && n.tabRect && n.label) {
      const tab = n.tabRect;
      ctx.font = TAB_FONT_CSS;
      ctx.fillStyle = palette.fg;
      const text = fit(TAB_FONT_CSS, n.label, tab.w * s - 12);
      ctx.fillText(text, tab.x * s + tx + 6, (tab.y + tab.h / 2) * s + ty);
    } else if (n.labelShown) {
      if (n.mode === 'open') {
        row(n, sx, sw, sy + n.headerHeight / 2, headerFontSize(n.kind, n.headerHeight));
      } else {
        const rowHeight = Math.min(sh, CLOSED_ROW[n.kind] ?? (n.kind === 'symbol' ? sh : 26));
        row(n, sx, sw, sy + rowHeight / 2, closedFontPx(n.kind));
      }
    }
    ctx.globalAlpha = 1;
  }

  function tabBox(n: SceneNode, px: number): void {
    const tab: SceneRect | null = n.tabRect;
    if (n.header !== 'tab' || !tab) return;
    ctx.globalAlpha = alphaOf(n);
    round(tab.x, tab.y, tab.w, tab.h, TAB_RADIUS * px);
    ctx.fillStyle = palette.panel;
    ctx.fill();
    ctx.strokeStyle = palette.line2;
    ctx.lineWidth = px;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const edgePainter = createEdgePainter(ctx, palette);
  const shown: SceneNode[] = [];

  return {
    paint(
      scene: Pick<MapScene, 'nodes' | 'edges' | 'bundles'>,
      camera: Camera,
      viewport: Viewport,
      dpr: number,
    ) {
      const { scale: s, tx, ty } = camera;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, viewport.width * dpr, viewport.height * dpr);
      const x0 = -tx / s;
      const y0 = -ty / s;
      const x1 = (viewport.width - tx) / s;
      const y1 = (viewport.height - ty) / s;
      shown.length = 0;
      for (const n of scene.nodes) {
        const { rect: r, tabRect } = n;
        const left = Math.min(r.x, tabRect?.x ?? r.x);
        const top = Math.min(r.y, tabRect?.y ?? r.y);
        if (left < x1 && top < y1 && r.x + r.w > x0 && r.y + r.h > y0) shown.push(n);
      }
      const px = 1 / s;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
      // Open containers hold the others: they go first.
      for (const n of shown) {
        if (n.mode !== 'open') continue;
        boxes(n, px);
        tabBox(n, px);
      }
      for (const n of shown) {
        if (n.mode === 'open') continue;
        boxes(n, px);
        tabBox(n, px);
      }
      const selecting =
        scene.nodes.some((n) => n.emphasis !== null) ||
        scene.edges.some((e) => e.emphasis !== 'normal');
      edgePainter.lines(scene.edges, camera, selecting, scene.bundles);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = 'middle';
      edgePainter.labels(scene.edges, camera, scene.bundles);
      for (const n of shown) texts(n, camera);
    },
  };
}
