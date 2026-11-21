import type { DiffStatus } from '../../review/helpers/diff-layer.logic';
import { impactState, onImpactPath, type ImpactMarks } from '../../review/helpers/impact.logic';
import type { ReadingNodeState } from '../../review/business/reading-order.business';
import type { CoChangeLine, EdgeLine, VisibleNode } from '../business/map.business';
import { edgeLabelVisible } from './edges.logic';
import { edgeKey, type EdgeEmphasis, type NodeEmphasis } from './emphasis.logic';
import { closedLabelVisible, headerLayout, type HeaderLabel } from './header.logic';
import type { NodeInfo } from './node-info.logic';
import { nodeContent, sizeClass, type NodeContent } from './node-content.logic';

/** A rectangle in world units. */
export interface SceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneNode {
  id: string;
  kind: string;
  mode: VisibleNode['mode'];
  /** The title of the node, shown or not (see `labelShown`). */
  label: string;
  labelShown: boolean;
  header: HeaderLabel;
  status: DiffStatus | null;
  intensity: number | null;
  oldLocation: boolean;
  badges: string[];
  counts: NodeContent['counts'];
  sub: string | null;
  impact: 'hit' | 'box' | 'dim' | null;
  impactCount: number;
  reading: ReadingNodeState | null;
  flagged: boolean;
  loading: boolean;
  risk: number | null;
  faded: boolean;
  emphasis: NodeEmphasis | null;
  rect: SceneRect;
  /** Height in pixels of the header of an open container, 0 for the others. */
  headerHeight: number;
  /** The shown label is wider than the room its header or box leaves it. */
  labelClipped: boolean;
  /** The title tab straddling the top border (world units), only when `header` is 'tab'. */
  tabRect: SceneRect | null;
}

export interface SceneEdge {
  from: string;
  to: string;
  status: DiffStatus;
  count: number;
  changed: boolean;
  selected: boolean;
  merged: boolean;
  coChange: boolean;
  impactPath: boolean;
  violation: 'new' | 'old' | null;
  emphasis: EdgeEmphasis;
  label: { text: string; cls: string; visible: boolean };
  tooltip: string;
  labelRect: SceneRect | null;
  mid: { x: number; y: number };
  /** The curve and arrow head (SVG path data, world units), and whether the label is covered. */
  shape: { d: string; arrow: string; covered: boolean };
}

export interface MapScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
}

export interface MapSceneInput {
  nodes: readonly VisibleNode[];
  edgeLines: readonly EdgeLine[];
  mergedEdgeLines: readonly EdgeLine[];
  coChangeLines: readonly CoChangeLine[];
  emphasis: {
    nodes: ReadonlyMap<string, NodeEmphasis>;
    edges: ReadonlyMap<string, EdgeEmphasis>;
  };
  modesScale: number;
  info: (id: string) => NodeInfo | undefined;
  t: (key: string, params?: Record<string, unknown>) => string;
  impact: ImpactMarks | null;
  reading: ((id: string) => ReadingNodeState | null) | null;
  focus: ReadonlySet<string> | null;
  archi: ReadonlySet<string> | null;
  risk: ReadonlyMap<string, number> | null;
  loading: ReadonlySet<string>;
  /** Width in pixels of a text in a CSS font; the component measures with a canvas. */
  measureLabel?: (text: string, font: string) => number;
}

/** Without a measurer: about 0.6 em per character. */
const estimateLabel = (text: string, font: string): number => {
  const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '12');
  return text.length * size * 0.6;
};

const MONO = "ui-monospace, 'JetBrains Mono', Menlo, monospace";

/** Font of the title of a node, shared by the measure here and by the painters. */
const fonts = new Map<string, string>();
export function labelFont(kind: string, fontPx: number): string {
  const key = `${kind}|${fontPx}`;
  let font = fonts.get(key);
  if (!font) {
    const family = kind === 'file' || kind === 'symbol' ? MONO : 'sans-serif';
    font = `${kind === 'service' ? 600 : 500} ${fontPx}px ${family}`;
    fonts.set(key, font);
  }
  return font;
}

/** Font size in pixels of the title of a closed box, by kind (`map-canvas.component.scss`). */
export function closedFontPx(kind: string): number {
  if (kind === 'service' || kind === 'package' || kind === 'workspace') return 15;
  if (kind === 'module') return 13;
  return kind === 'symbol' ? 11.5 : 12;
}

/** Tab of a title on the top border: font, padding and offsets, in pixels. */
export const TAB_FONT_CSS = '11px sans-serif';
const TAB_PAD = 14;
const TAB_H = 18;
const TAB_TOP = 9;
const TAB_LEFT = 8;
const TAB_MARGIN = 30;
/** Horizontal room a label loses to the padding of its header, in pixels (none in a closed box). */
const LABEL_PAD = 16;

/** Room of an edge label on screen, in pixels. */
const LABEL_W = 28;
const LABEL_H = 16;

/** What the map draws, in world units, whatever draws it. Pure. */
export function buildMapScene(input: MapSceneInput): MapScene {
  // Everything is "sharp" without a selection: that is no emphasis at all.
  const selecting = [...input.emphasis.nodes.values()].includes('dim');
  return {
    nodes: input.nodes.map((node) => sceneNode(node, input, selecting)),
    edges: [
      ...input.edgeLines.map((line) => sceneEdge(line, false, input)),
      ...input.mergedEdgeLines.map((line) => sceneEdge(line, true, input)),
      ...input.coChangeLines.map((line) => sceneCoChange(line, input)),
    ],
  };
}

function sceneNode(node: VisibleNode, input: MapSceneInput, selecting: boolean): SceneNode {
  const { modesScale: scale, impact } = input;
  const width = node.w * scale;
  const height = node.h * scale;
  const info = input.info(node.id);
  const content = info ? nodeContent(info, node.mode, sizeClass(width)) : null;
  const open = node.mode === 'open' ? headerLayout(node.kind, scale) : null;
  const measure = input.measureLabel ?? estimateLabel;
  const label = info?.label ?? '';
  const labelShown =
    node.mode === 'ghost'
      ? false
      : open
        ? open.label === 'header'
        : closedLabelVisible(width, height);
  const fontPx = open ? open.fontSize : closedFontPx(node.kind);
  const font = labelFont(node.kind, fontPx);
  const tabWidth =
    open?.label === 'tab'
      ? Math.max(0, Math.min(measure(label, TAB_FONT_CSS) + TAB_PAD, width - TAB_MARGIN))
      : 0;
  const state = impactState(impact, node.id);
  const kept = !!impact && (impact.reached.has(node.id) || impact.scope.has(node.id));
  const emphasis = selecting ? (input.emphasis.nodes.get(node.id) ?? null) : null;
  const mark = node.mark;
  return {
    id: node.id,
    kind: node.kind,
    mode: node.mode,
    label,
    labelShown,
    header: open ? open.label : 'none',
    status: mark?.status ?? null,
    intensity: mark?.intensity ?? null,
    oldLocation: mark?.oldLocation ?? false,
    badges: mark ? [...mark.badges] : [],
    counts: content?.counts ?? [],
    sub: content?.sub ?? null,
    impact: state === '' ? null : state,
    impactCount: impact && state === 'box' ? (impact.counts.get(node.id) ?? 0) : 0,
    reading: input.reading?.(node.id) ?? null,
    flagged: !!input.archi?.has(node.id),
    loading: input.loading.has(node.id),
    risk: input.risk ? (input.risk.get(node.id) ?? 0) : null,
    faded: !!input.focus && !input.focus.has(node.id),
    emphasis: emphasis === 'dim' && kept ? null : emphasis,
    rect: { x: node.x, y: node.y, w: node.w, h: node.h },
    headerHeight: open ? open.height : 0,
    labelClipped:
      labelShown && label !== '' && measure(label, font) > width - (open ? LABEL_PAD : 0),
    tabRect:
      open?.label === 'tab'
        ? {
            x: node.x + TAB_LEFT / scale,
            y: node.y - TAB_TOP / scale,
            w: tabWidth / scale,
            h: TAB_H / scale,
          }
        : null,
  };
}

function labelRect(text: string, mx: number, my: number, scale: number): SceneRect | null {
  if (text === '') return null;
  const w = LABEL_W / scale;
  const h = LABEL_H / scale;
  return { x: mx - w / 2, y: my - h / 2, w, h };
}

function sceneEdge(line: EdgeLine, merged: boolean, input: MapSceneInput): SceneEdge {
  const { edge, shape, violations } = line;
  return {
    from: edge.from,
    to: edge.to,
    status: line.status,
    count: edge.count,
    changed: edge.changed,
    selected: line.selected,
    merged,
    coChange: false,
    impactPath: onImpactPath(input.impact, edge.from, edge.to),
    violation: violations.introduced > 0 ? 'new' : violations.existing > 0 ? 'old' : null,
    emphasis: input.emphasis.edges.get(edgeKey(edge.from, edge.to)) ?? 'normal',
    label: {
      text: line.label,
      cls: line.cls,
      visible: edgeLabelVisible(line.label, shape.length),
    },
    tooltip: line.tooltip,
    labelRect: labelRect(line.label, shape.mx, shape.my, input.modesScale),
    mid: { x: shape.mx, y: shape.my },
    shape: { d: shape.d, arrow: shape.arrow, covered: shape.covered },
  };
}

function sceneCoChange({ edge, shape }: CoChangeLine, input: MapSceneInput): SceneEdge {
  return {
    from: edge.from,
    to: edge.to,
    status: 'unchanged',
    count: edge.count,
    changed: edge.changed,
    selected: false,
    merged: false,
    coChange: true,
    impactPath: false,
    violation: null,
    emphasis: input.emphasis.edges.get(edgeKey(edge.from, edge.to)) ?? 'normal',
    label: { text: '', cls: 'base', visible: false },
    tooltip: '',
    labelRect: null,
    mid: { x: shape.mx, y: shape.my },
    shape: { d: shape.d, arrow: shape.arrow, covered: shape.covered },
  };
}
