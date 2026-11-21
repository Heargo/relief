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
}

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
  const state = impactState(impact, node.id);
  const kept = !!impact && (impact.reached.has(node.id) || impact.scope.has(node.id));
  const emphasis = selecting ? (input.emphasis.nodes.get(node.id) ?? null) : null;
  const mark = node.mark;
  return {
    id: node.id,
    kind: node.kind,
    mode: node.mode,
    label: info?.label ?? '',
    labelShown:
      node.mode === 'ghost'
        ? false
        : open
          ? open.label === 'header'
          : closedLabelVisible(width, height),
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
  };
}
