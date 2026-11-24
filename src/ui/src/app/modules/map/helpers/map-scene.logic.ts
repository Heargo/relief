import type { DiffStatus } from '../../review/helpers/diff-layer.logic';
import { impactState, onImpactPath, type ImpactMarks } from '../../review/helpers/impact.logic';
import type { ReadingNodeState } from '../../review/business/reading-order.business';
import type { CoChangeLine, EdgeLine, VisibleNode } from '../business/map.business';
import {
  EDGE_LABELS_REST,
  edgeLabelShown,
  edgeLabelVisible,
  type EdgeLabelContext,
} from './edges.logic';
import type { BundleBranch, EdgeBundle } from './edge-bundles.logic';
import { edgeKey, type EdgeEmphasis, type NodeEmphasis } from './emphasis.logic';
import { closedLabelVisible, headerLayout, type HeaderLabel } from './header.logic';
import type { NodeInfo } from './node-info.logic';
import type { TestedBy } from './test-edges.logic';
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
  /** Labels of a repository box, empty elsewhere. */
  tags?: string[];
  impact: 'hit' | 'box' | 'dim' | null;
  impactCount: number;
  reading: ReadingNodeState | null;
  flagged: boolean;
  loading: boolean;
  risk: number | null;
  faded: boolean;
  /** Faded by the step-by-step reading: painted much lighter. */
  deepFade?: boolean;
  /** A test box: drawn dimmed. */
  test?: boolean;
  /** "Tested by N (of which M new)" on the target of folded test edges, null without. */
  testedBy?: TestedBy | null;
  /** "×N identical" on the representative of a group of repeated changes, null without. */
  repeated?: { count: number } | null;
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
  /** Outside the step-by-step neighbourhood: painted much lighter. */
  faded?: boolean;
  label: { text: string; cls: string; visible: boolean };
  tooltip: string;
  labelRect: SceneRect | null;
  /** Middle of the edge; on its branch when the edge is bundled. */
  mid: { x: number; y: number };
  /** The curve and arrow head (SVG path data, world units), and whether the label is covered. */
  shape: { d: string; arrow: string; covered: boolean };
  /** The points of the route along the corridors (world units); null for the direct curve. */
  route?: { x: number; y: number }[] | null;
  /** Id of the bundle the edge belongs to, null when it is drawn alone. */
  bundle?: string | null;
  /** The pointer is on the edge. */
  hovered?: boolean;
}

/** Edges that enter (or leave) a box by the same side, drawn as a shared trunk and branches. */
export interface SceneBundle {
  id: string;
  box: string;
  side: EdgeBundle['side'];
  end: EdgeBundle['end'];
  count: number;
  added: number;
  status: DiffStatus;
  mixed: boolean;
  selected: boolean;
  /** Middle of the trunk, in world units. */
  mid: { x: number; y: number };
  trunk: { d: string };
  branches: BundleBranch[];
  edges: { from: string; to: string }[];
  /** The count, and the new edges after it in review. */
  label: { text: string };
}

export interface MapScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  bundles?: SceneBundle[];
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
  /** What shows the individual edge labels; absent means at rest. */
  edgeLabels?: EdgeLabelContext;
  info: (id: string) => NodeInfo | undefined;
  t: (key: string, params?: Record<string, unknown>) => string;
  impact: ImpactMarks | null;
  reading: ((id: string) => ReadingNodeState | null) | null;
  focus: ReadonlySet<string> | null;
  /** Step-by-step reading: the sharp edges (`edgeKey`); the others are faded. Null when off. */
  stepEdges?: ReadonlySet<string> | null;
  /** Step-by-step reading: the current element and its neighbours; what they hold stays sharp. */
  stepElements?: ReadonlySet<string> | null;
  archi: ReadonlySet<string> | null;
  risk: ReadonlyMap<string, number> | null;
  loading: ReadonlySet<string>;
  /** The bundles of the edges (`bundleEdges`), computed at rest. */
  bundles?: readonly EdgeBundle[];
  /** Id of the selected bundle. */
  selectedBundle?: string | null;
  /** Tells the test boxes (dimmed) and the "tested by" badge of the targets of folded edges. */
  tests?: { isTest: (id: string) => boolean; badges: ReadonlyMap<string, TestedBy> };
  /** Repeated changes: the group size by representative, and the other members (faded). */
  repeated?: { counts: ReadonlyMap<string, number>; faded: ReadonlySet<string> };
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
  if (kind === 'repo' || kind === 'service' || kind === 'package' || kind === 'workspace')
    return 15;
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
export function buildMapScene(input: MapSceneInput): MapScene & { bundles: SceneBundle[] } {
  // Everything is "sharp" without a selection: that is no emphasis at all.
  const selecting = [...input.emphasis.nodes.values()].includes('dim');
  const bundles = input.bundles ?? [];
  const ofEdge = new Map<string, { bundle: string; d: string }>();
  for (const b of bundles)
    for (const br of b.branches) ofEdge.set(edgeKey(br.from, br.to), { bundle: b.id, d: br.d });
  return {
    nodes: input.nodes.map((node) => sceneNode(node, input, selecting)),
    edges: [
      ...input.edgeLines.map((line) => sceneEdge(line, false, input, ofEdge)),
      ...input.mergedEdgeLines.map((line) => sceneEdge(line, true, input, ofEdge)),
      ...input.coChangeLines.map((line) => sceneCoChange(line, input)),
    ],
    bundles: bundles.map((b) => ({
      id: b.id,
      box: b.box,
      side: b.side,
      end: b.end,
      count: b.count,
      added: b.added,
      status: b.status,
      mixed: b.mixed,
      selected: input.selectedBundle === b.id,
      mid: b.mid,
      trunk: { d: b.trunk.d },
      branches: b.branches,
      edges: b.branches.map(({ from, to }) => ({ from, to })),
      label: { text: b.added > 0 ? `${b.count} +${b.added}` : String(b.count) },
    })),
  };
}

/** The middle of a quadratic path `M x0,y0 Q cx,cy x1,y1`. */
function quadMid(d: string): { x: number; y: number } | null {
  const n = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map(Number);
  if (n.length < 6) return null;
  return { x: (n[0] + 2 * n[2] + n[4]) / 4, y: (n[1] + 2 * n[3] + n[5]) / 4 };
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
  const repeatedCount = input.repeated?.counts.get(node.id);
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
    tags: content?.tags ?? [],
    impact: state === '' ? null : state,
    impactCount: impact && state === 'box' ? (impact.counts.get(node.id) ?? 0) : 0,
    reading: input.reading?.(node.id) ?? null,
    flagged: !!input.archi?.has(node.id),
    loading: input.loading.has(node.id),
    risk: input.risk ? (input.risk.get(node.id) ?? 0) : null,
    faded: (!!input.focus && fadedNode(node.id, input)) || !!input.repeated?.faded.has(node.id),
    repeated: repeatedCount === undefined ? null : { count: repeatedCount },
    test: input.tests?.isTest(node.id) ?? false,
    testedBy: input.tests?.badges.get(node.id) ?? null,
    deepFade: !!input.stepEdges && !!input.focus && fadedNode(node.id, input),
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

function labelRect(
  text: string,
  visible: boolean,
  mx: number,
  my: number,
  scale: number,
): SceneRect | null {
  if (text === '' || !visible) return null;
  const w = LABEL_W / scale;
  const h = LABEL_H / scale;
  return { x: mx - w / 2, y: my - h / 2, w, h };
}

const fine = (id: string): boolean => /^(file|sym):/.test(id.split('::').pop() ?? '');
const within = (id: string, box: string): boolean =>
  id === box || id.startsWith(`${box}::`) || id.startsWith(`${box}/`);

/** What the step-by-step reading looks up for each node and edge, built once per scene. */
interface StepIndex {
  elements: string[];
  pairs: [string, string][];
  of: Map<string, string | undefined>;
}
const stepIndexes = new WeakMap<object, StepIndex>();

function stepIndexOf(input: Pick<MapSceneInput, 'stepEdges' | 'stepElements'>): StepIndex {
  let index = stepIndexes.get(input);
  if (!index) {
    index = {
      elements: [...(input.stepElements ?? [])],
      pairs: [...(input.stepEdges ?? [])].map((k) => k.split('\u0000') as [string, string]),
      of: new Map(),
    };
    stepIndexes.set(input, index);
  }
  return index;
}

/** The current element or neighbour that holds `id`, if any. */
function elementOf(index: StepIndex, id: string): string | undefined {
  if (!index.of.has(id))
    index.of.set(
      id,
      index.elements.find((e) => within(id, e)),
    );
  return index.of.get(id);
}

/** Not in the focus, nor inside the current element or one of its neighbours. */
function fadedNode(id: string, input: MapSceneInput): boolean {
  if (input.focus?.has(id)) return false;
  return elementOf(stepIndexOf(input), id) === undefined;
}

/**
 * Whether an edge lies outside the sharp edges of the step-by-step reading. A line between files
 * or symbols is sharp when its own key is; a line aggregated up to a box is sharp when it covers
 * a sharp edge.
 */
export function edgeFaded(
  from: string,
  to: string,
  input: Pick<MapSceneInput, 'stepEdges' | 'stepElements'>,
): boolean {
  const sharp = input.stepEdges;
  if (!sharp) return false;
  const index = stepIndexOf(input);
  const a = elementOf(index, from);
  const b = elementOf(index, to);
  if (a !== undefined && b !== undefined && (a === b || sharp.has(edgeKey(a, b)))) return false;
  if (sharp.has(edgeKey(from, to))) return false;
  if (fine(from) && fine(to)) return true;
  return !index.pairs.some(([x, y]) => within(x, from) && within(y, to));
}

function sceneEdge(
  line: EdgeLine,
  merged: boolean,
  input: MapSceneInput,
  bundled: ReadonlyMap<string, { bundle: string; d: string }>,
): SceneEdge {
  const { edge, shape, violations } = line;
  const inBundle = bundled.get(edgeKey(edge.from, edge.to));
  const hover = input.edgeLabels?.hovered;
  const hovered = !!hover && hover.from === edge.from && hover.to === edge.to;
  const mid = (inBundle && quadMid(inBundle.d)) || { x: shape.mx, y: shape.my };
  const violating = violations.introduced > 0 || violations.existing > 0;
  const labelVisible =
    edgeLabelVisible(line.label, shape.length) &&
    (merged ||
      edgeLabelShown(
        { from: edge.from, to: edge.to, violation: violating },
        input.edgeLabels ?? EDGE_LABELS_REST,
      ));
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
    faded: edgeFaded(edge.from, edge.to, input),
    label: { text: line.label, cls: line.cls, visible: labelVisible },
    tooltip: line.tooltip,
    labelRect: labelRect(line.label, labelVisible, mid.x, mid.y, input.modesScale),
    mid,
    shape: { d: shape.d, arrow: shape.arrow, covered: shape.covered },
    route: inBundle || !shape.route ? null : shape.route.map((p) => ({ x: p.x, y: p.y })),
    bundle: inBundle?.bundle ?? null,
    hovered,
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
    faded: edgeFaded(edge.from, edge.to, input),
    label: { text: '', cls: 'base', visible: false },
    tooltip: '',
    labelRect: null,
    mid: { x: shape.mx, y: shape.my },
    shape: { d: shape.d, arrow: shape.arrow, covered: shape.covered },
    route: null,
    bundle: null,
    hovered: false,
  };
}
