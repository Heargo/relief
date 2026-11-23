import { computed, inject, Injectable, signal } from '@angular/core';

import { measured } from '../../../core/helpers/perf';

import type {
  DiffResponse,
  Edge,
  GraphDiff,
  GraphSnapshot,
  Violation,
  ViolationEdge,
} from '../../../core/models/contract';
import type { Split } from '../../rules/helpers/rules.logic';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import {
  type Camera,
  currentLevel,
  easeInOutCubic,
  fitRect,
  fitScale,
  interpolateCamera,
  levelCamera,
  levelScales,
  panBy,
  type Viewport,
  zoomAt,
} from '../helpers/camera.logic';
import {
  type AggregatedEdge,
  aggregateEdges,
  edgeGeometry,
  type EdgeGeometry,
  edgeShape,
  type EdgeShape,
  isAncestor,
  visibleAncestor,
} from '../helpers/edges.logic';
import {
  diffMarks,
  type DiffStatus,
  edgeStatus,
  type NodeMark,
} from '../../review/helpers/diff-layer.logic';
import { breadcrumbTrail, type Crumb } from '../helpers/breadcrumb.logic';
import { layoutCrossings } from '../helpers/crossings.logic';
import { computeLayouts, type Layouts } from '../helpers/layout-compute.logic';
import { LAYOUT_EXECUTOR, onThreadExecutor } from './layout-executor';
import {
  DEFAULT_LAYOUT_MODE,
  type LayoutMode,
  readLayoutMode,
  writeLayoutMode,
} from '../helpers/layout-mode.logic';
import { interpolateLayout, type MapLayout, type Rect } from '../helpers/layout.logic';
import { createBoxGrid } from '../helpers/box-grid.logic';
import { type EdgeState } from '../helpers/edge-state.logic';
import { createEdgeAggregator } from '../helpers/edge-aggregator.logic';
import { createEdgeStateCache } from '../helpers/edge-state-cache.logic';
import {
  edgeBounds,
  edgeInView,
  partitionEdges,
  type EdgeDetail,
} from '../helpers/edge-culling.logic';
import { onImpactPath, type ImpactMarks } from '../../review/helpers/impact.logic';
import { foldTestEdges, testNodeIds } from '../helpers/test-edges.logic';
import { buildNodeInfos, type NodeInfo } from '../helpers/node-info.logic';
import { headRef } from '../helpers/repo.logic';
import { containerToLoad, zoomedBox } from '../helpers/subgraph.logic';
import {
  DEFAULT_HIDE_EXTERNAL,
  hideExternalDeps,
  readEdgeLabelsAlways,
  readTestEdges,
  writeTestEdges,
  readHideExternal,
  writeEdgeLabelsAlways,
  writeHideExternal,
} from '../helpers/external.logic';
import { buildSearchIndex, searchNodes, type SearchResult } from '../helpers/search.logic';
import { edgesAround, nodeEdges } from '../helpers/node-edges.logic';
import {
  edgeEmphasis,
  edgeKey,
  nodeEmphasis,
  type EdgeEmphasis,
  type Selection,
} from '../helpers/emphasis.logic';
import {
  canGoBack,
  canGoForward,
  clearHistory,
  currentStep,
  emptyHistory,
  goBack,
  goForward,
  type History,
  pushStep,
} from '../helpers/history.logic';
import { escapeStep } from '../helpers/shortcuts.logic';
import {
  layerTransform,
  REST_DELAY_MS,
  shouldRecomputeModes,
  viewLeavesRenderedArea,
} from '../helpers/camera-layer.logic';
import {
  computeModes,
  isInViewport,
  levelOfKind,
  type NodeMode,
} from '../helpers/visibility.logic';

/** A step of the navigation: what is selected, and where the camera is. */
interface NavStep {
  nodeId: string | null;
  edgeKey: string | null;
  listedEdge: AggregatedEdge | null;
  fine: ViolationEdge | null;
  camera: Camera;
  level: number | null;
  cap: number | null;
}

export type MapStatus = 'loading' | 'error' | 'ready';

/** A node to draw, in world units (the camera is the transform of the layer). */
export interface VisibleNode {
  id: string;
  kind: string;
  mode: Exclude<NodeMode, 'hidden'>;
  x: number;
  y: number;
  w: number;
  h: number;
  /** What the diff layer says about the node; null while the layer is off. */
  mark: NodeMark | null;
}

/** An aggregated edge placed in the world. */
export interface EdgeLine extends EdgeState {
  edge: AggregatedEdge;
  shape: EdgeShape;
  selected: boolean;
}

interface DetailedEdgeLine extends EdgeLine, EdgeDetail {}

/** A logical coupling edge placed in the world. */
export interface CoChangeLine {
  edge: AggregatedEdge;
  shape: EdgeShape;
}

function unchangedKey(review: boolean): string {
  return `relief.unchangedEdges.${review ? 'review' : 'explore'}`;
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const EMPTY_GRAPH: GraphSnapshot = { commit: '', nodes: [], edges: [] };
const MAX_SCALE = 2.6;
/** Pixels around the screen where nodes are drawn already. */
const RENDER_MARGIN = 120;
const ANIMATION_MS = 480;
const FIT_OPTIONS = { pad: 50, maxScale: 9 };
const EMPTY_LAYOUT: MapLayout = {
  nodes: new Map(),
  roots: [],
  bounds: { x: 0, y: 0, w: 0, h: 0 },
};

/** State of the map: layout, camera, level and what is visible at the current zoom. */
@Injectable()
export class MapBusiness {
  private readonly api = inject(ReliefApiService);

  private readonly _status = signal<MapStatus>('loading');
  /** The layout drawn now: it moves between two layouts while the switch is animated. */
  private readonly _layout = signal<MapLayout>(EMPTY_LAYOUT);
  /** The layout the map is at, or flying to. */
  private readonly _targetLayout = signal<MapLayout>(EMPTY_LAYOUT);
  private readonly _layouts = signal<Layouts | null>(null);
  private readonly _layoutMode = signal<LayoutMode>(
    (() => {
      const source = storage();
      return source ? readLayoutMode(source) : DEFAULT_LAYOUT_MODE;
    })(),
  );
  private readonly _hideExternal = signal(
    (() => {
      const source = storage();
      return source ? readHideExternal(source) : DEFAULT_HIDE_EXTERNAL;
    })(),
  );
  private readonly _edgeLabelsAlways = signal(
    (() => {
      const source = storage();
      return source ? readEdgeLabelsAlways(source) : false;
    })(),
  );
  private readonly _showTestEdges = signal(
    (() => {
      const source = storage();
      return source ? readTestEdges(source) : false;
    })(),
  );
  /** Targets whose test edges were unfolded by a click on their badge. */
  private readonly _unfoldedTests = signal<ReadonlySet<string>>(new Set());
  /** The nodes the core flags as tests, and the nodes under them. */
  private readonly _testIds = signal<ReadonlySet<string>>(new Set());
  private readonly _hoveredEdge = signal<{ from: string; to: string } | null>(null);
  /** The graph as received, before the display filters. */
  private sourceGraph: GraphSnapshot = EMPTY_GRAPH;
  private readonly _infos = signal<Map<string, NodeInfo>>(new Map());
  private readonly _camera = signal<Camera>({ scale: 1, tx: 0, ty: 0 });
  /** The camera the modes, headers and edge shapes were computed for (it lags during a zoom). */
  private readonly _modesCamera = signal<Camera>({ scale: 1, tx: 0, ty: 0 });
  /** The camera the nodes were culled for (it lags during a pan, up to the render margin). */
  private readonly _cullCamera = signal<Camera>({ scale: 1, tx: 0, ty: 0 });
  private restTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _viewport = signal<Viewport>({ width: 0, height: 0 });
  /** Level chosen explicitly (button, key, fit, dive); cleared by zooming. */
  private readonly _forcedLevel = signal<number | null>(null);
  /** Depth cap that goes with a chosen level (not with a dive). */
  private readonly _cap = signal<number | null>(null);

  private readonly _edges = signal<Edge[]>([]);
  private readonly _coChangeEdges = signal<Edge[]>([]);
  private readonly _parents = signal<Map<string, string | null>>(new Map());
  private readonly _selectedEdgeKey = signal<string | null>(null);
  private readonly _selectedNodeId = signal<string | null>(null);
  /** The edge chosen in the list of a node, when the map does not draw it at this zoom. */
  private readonly _listedEdge = signal<AggregatedEdge | null>(null);
  private readonly _showUnchangedEdges = signal(true);
  private readonly _reviewMode = signal(false);
  private readonly _diff = signal<DiffResponse | null>(null);
  /** The language of the edge texts: the translator changes with the language. */
  private readonly _translate = signal<{
    t: (key: string, params?: Record<string, unknown>) => string;
  }>({ t: (key) => key });
  private readonly _violations = signal<readonly Violation[]>([]);
  /** A violating fine edge picked from a rule: the aggregated edge holding it is selected. */
  private readonly _selectedFine = signal<ViolationEdge | null>(null);
  private readonly _commitFiles = signal<ReadonlySet<string> | null>(null);

  private readonly _graph = signal<GraphSnapshot>(EMPTY_GRAPH);
  private readonly _repoName = signal('');
  private readonly _helpOpen = signal(false);

  /** Where the last zoom in pointed, in screen pixels; null after any other camera move. */
  private readonly _zoomPoint = signal<{ x: number; y: number } | null>(null);
  /** The node the camera was sent to (dive, search, double click); null after any other move. */
  private readonly _diveTarget = signal<string | null>(null);
  /** What to do once the next graph is laid out (the content of a container just arrived). */
  private afterShow: (() => void)[] = [];
  private showRequest = 0;
  /** A first layout is on its way: the actions of the user wait for it, as they would for the map. */
  private layingOut = false;
  private readonly executeLayout = inject(LAYOUT_EXECUTOR);

  private readonly _history = signal<History<NavStep>>(emptyHistory());
  /** Where the running camera flight ends; meaningful while `animation` is set. */
  private flightTarget: Camera | null = null;

  private pristine = true;
  private beforeFrame: { camera: Camera; level: number | null } | null = null;
  private animation = 0;
  private pendingSettle: (() => void) | null = null;

  readonly canGoBack = computed(() => canGoBack(this._history()));
  readonly canGoForward = computed(() => canGoForward(this._history()));
  readonly status = this._status.asReadonly();
  readonly layoutMode = this._layoutMode.asReadonly();
  readonly hideExternal = this._hideExternal.asReadonly();
  readonly camera = this._camera.asReadonly();
  /** The whole camera, as the CSS transform of the layer that holds the nodes and the edges. */
  readonly layerTransform = computed(() => layerTransform(this._camera()));
  /** Scale the modes, headers and edge shapes are drawn for (the scale at rest). */
  readonly modesScale = computed(() => this._modesCamera().scale);
  readonly viewport = this._viewport.asReadonly();

  private readonly scales = computed(() => levelScales(this._layout(), this._viewport()));
  readonly level = computed(
    () => this._forcedLevel() ?? currentLevel(this._camera().scale, this.scales()),
  );

  /** Diff marks of every node, empty while the diff layer is off. */
  private readonly marks = computed(() => {
    const diff = this._diff();
    const marks = diff ? diffMarks(this._graph(), diff) : new Map<string, NodeMark>();
    const only = this._commitFiles();
    if (!only) return marks;
    // One commit replayed: only its files are coloured, not what holds or is held by them.
    return new Map(
      [...marks].map(([id, mark]) => [
        id,
        only.has(id) || mark.oldLocation
          ? mark
          : { ...mark, status: 'unchanged' as const, badges: [] },
      ]),
    );
  });

  /** What each node shows (open, box, ghost), for the scale of the last rest or threshold. */
  private readonly modes = computed(() =>
    measured('modes', () =>
      computeModes(this._layout(), { scale: this.modesScale(), tx: 0, ty: 0 }, this._cap() ?? 3),
    ),
  );

  readonly visibleNodes = computed<VisibleNode[]>(() =>
    measured('visibleNodes', () => {
      const layout = this._layout();
      const camera = this._cullCamera();
      const viewport = this._viewport();
      const modes = this.modes();
      const marks = this.marks();
      // A ring around the screen is drawn too, so that nodes just out of sight do not pop in.
      const padded: Viewport = {
        width: viewport.width + 2 * RENDER_MARGIN,
        height: viewport.height + 2 * RENDER_MARGIN,
      };
      const shifted: Camera = {
        ...camera,
        tx: camera.tx + RENDER_MARGIN,
        ty: camera.ty + RENDER_MARGIN,
      };
      const result: VisibleNode[] = [];
      for (const node of layout.nodes.values()) {
        const mode = modes.get(node.id);
        if (!mode || mode === 'hidden' || !isInViewport(node, shifted, padded)) continue;
        result.push({
          id: node.id,
          kind: node.kind,
          mode,
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h,
          mark: marks.get(node.id) ?? null,
        });
      }
      return result;
    }),
  );

  /** The closed boxes, wherever they are (camera-free): the edge labels slide off them. */
  private readonly visibleBoxes = computed<Rect[]>(() =>
    measured('visibleBoxes', () => {
      const modes = this.modes();
      const boxes: Rect[] = [];
      for (const node of this._layout().nodes.values()) {
        if (modes.get(node.id) === 'box') boxes.push(node);
      }
      return boxes;
    }),
  );

  private readonly boxGrid = computed(() => createBoxGrid(this.visibleBoxes()));

  /** The closed container the user zooms into, whose content is to be loaded; null for none. */
  readonly containerToLoad = computed<string | null>(() => {
    const graph = this._graph();
    // A flight to a node loads it; only a zoom in by the user looks at what is under the pointer
    // (a camera in flight would open every container it flies over).
    const point = this._zoomPoint();
    if (!point) return containerToLoad(graph, this._diveTarget());
    const camera = this._camera();
    const layout = this._layout();
    const boxes = (this.visibleBoxes() as Array<Rect & { id: string }>)
      .filter((n) => layout.nodes.has(n.id))
      .map((n) => ({
        id: n.id,
        x: n.x * camera.scale + camera.tx,
        y: n.y * camera.scale + camera.ty,
        w: n.w * camera.scale,
        h: n.h * camera.scale,
      }));
    const focus = zoomedBox(boxes, point, (id) => containerToLoad(graph, id) !== null);
    return containerToLoad(graph, focus);
  });

  /** Boxes the edges attach to: open or closed boxes, not the ghosts drawn inside them. */
  private readonly boxIds = computed(
    () =>
      measured('boxIds', () => {
        const modes = this.modes();
        const ids = new Set<string>();
        for (const [id, mode] of modes) if (mode === 'open' || mode === 'box') ids.add(id);
        return ids;
      }),
    { equal: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)) },
  );

  /** Kept from one visibility to the next: a mode change rebuilds only the pairs it touches. */
  private readonly edgeAggregator = computed(() => {
    const diff = this._diff()?.diff;
    const infos = this._infos();
    return createEdgeAggregator(this._edges(), this._parents(), {
      isSymbol: (id) => infos.get(id)?.kind === 'symbol',
      changed: (edge) => diff !== undefined && edgeStatus(edge, diff) !== 'unchanged',
    });
  });

  /** The selected node: its edges go down to the symbols, the others stop at the files. */
  private readonly unfoldedNodes = computed(
    () => {
      const infos = this._infos();
      const unfolded = new Set<string>();
      const add = (id: string | null | undefined): void => {
        const kind = id ? infos.get(id)?.kind : undefined;
        if (id && (kind === 'file' || kind === 'symbol')) unfolded.add(id);
      };
      add(this._selectedNodeId());
      // A selected edge between symbols stays unfolded, so it keeps existing.
      const key = this._selectedEdgeKey();
      if (key !== null) {
        for (const end of key.split('\u0000')) if (infos.get(end)?.kind === 'symbol') add(end);
      }
      return unfolded;
    },
    { equal: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)) },
  );

  private readonly allEdges = computed(() =>
    measured('allEdges', () => this.edgeAggregator().update(this.boxIds(), this.unfoldedNodes())),
  );

  /** The logical coupling edges, aggregated for the current visibility and placed on screen. */
  readonly coChangeLines = computed<CoChangeLine[]>(() =>
    measured('coChangeLines', () => {
      const layout = this._layout();
      const scale = this.modesScale();
      const boxes = this.boxGrid();
      const lines: CoChangeLine[] = [];
      for (const edge of aggregateEdges(this._coChangeEdges(), this._parents(), this.boxIds())) {
        const a = layout.nodes.get(edge.from);
        const b = layout.nodes.get(edge.to);
        if (a && b) lines.push({ edge, shape: edgeShape(a, b, boxes, scale) });
      }
      return lines;
    }),
  );

  readonly showUnchangedEdges = this._showUnchangedEdges.asReadonly();
  /** The "Tests" layer on every edge: those that start at a test are folded, and the badges count
   * all the tests of a target, whatever the "unchanged edges" layer hides. */
  private readonly testFold = computed(() => {
    const id = this._selectedNodeId();
    return foldTestEdges(this.allEdges(), {
      isTest: (end) => this._testIds().has(end),
      layerOn: this._showTestEdges(),
      selected: id === null ? null : (this.visibleOf(id) ?? id),
      unfolded: this._unfoldedTests(),
      changed: (edge) => edge.changed,
    });
  });
  /** Aggregated edges drawn: after the "Tests" layer, then the "unchanged edges" layer. */
  readonly edges = computed(() => {
    const all = this.testFold().edges;
    // In review without a diff nothing is "changed": the layer has nothing to hide.
    if (this._showUnchangedEdges() || (this._reviewMode() && !this._diff())) return all;
    // The unchanged edges of the selected node stay, to keep the context of what is read. A
    // selected symbol keeps those of the box that holds it, as the edges are drawn between boxes.
    const id = this._selectedNodeId();
    const holder = id === null ? null : (this.visibleOf(id) ?? id);
    const touches = (end: string) =>
      id !== null && holder !== null && (this.within(end, id) || this.within(end, holder));
    // A test edge that survived the fold was unfolded on purpose: it stays.
    const unfolded = (end: string) => !this._showTestEdges() && this._testIds().has(end);
    return all.filter((e) => e.changed || touches(e.from) || touches(e.to) || unfolded(e.from));
  });
  /** "Tested by N" badges, by target box; empty while the "Tests" layer is expanded. */
  readonly testBadges = computed(() => this.testFold().badges);
  readonly showTestEdges = this._showTestEdges.asReadonly();
  readonly unfoldedTests = this._unfoldedTests.asReadonly();
  /** Whether a node is a test, or lies under one. */
  isTest(id: string): boolean {
    return this._testIds().has(id);
  }
  setShowTestEdges(on: boolean): void {
    this._showTestEdges.set(on);
    this._unfoldedTests.set(new Set());
    const source = storage();
    if (source) writeTestEdges(source, on);
  }
  /** A click on the badge of a target: draws, or folds again, the edges of its tests. */
  toggleTestEdges(target: string): void {
    const next = new Set(this._unfoldedTests());
    if (!next.delete(target)) next.add(target);
    this._unfoldedTests.set(next);
  }
  readonly selectedNodeId = this._selectedNodeId.asReadonly();
  /** What the map emphasises: the selected node, else the selected edge, else nothing. */
  readonly selection = computed<Selection | null>(() => {
    const id = this._selectedNodeId();
    if (id) return { kind: 'node', id };
    const edge = this.selectedEdge();
    return edge ? { kind: 'edge', from: edge.from, to: edge.to } : null;
  });
  /** Whether `id` is `box` or one of its descendants. */
  within(id: string, box: string): boolean {
    return id === box || isAncestor(box, id, this._parents());
  }
  /** First visible box of a node (itself included), or null. */
  visibleOf(id: string): string | null {
    return visibleAncestor(id, this._parents(), this.boxIds());
  }
  readonly helpOpen = this._helpOpen.asReadonly();
  private readonly searchIndex = computed(() => buildSearchIndex(this._graph()));
  /** Ancestors of the selected node, or the current level when nothing is selected. */
  readonly breadcrumbs = computed<Crumb[]>(() =>
    breadcrumbTrail({
      graph: this._graph(),
      repoName: this._repoName(),
      selectedId: this._selectedNodeId(),
      level: this.level(),
    }),
  );
  readonly selectedEdge = computed<AggregatedEdge | null>(() =>
    measured('selectedEdge', () => {
      const fine = this._selectedFine();
      if (fine) {
        return (
          this.allEdges().find((e) =>
            e.links.some((l) => l.from === fine.from && l.to === fine.to && l.kind === fine.kind),
          ) ?? null
        );
      }
      const key = this._selectedEdgeKey();
      if (key === null) return null;
      const listed = this._listedEdge();
      return (
        this.allEdges().find((e) => pairKey(e.from, e.to) === key) ??
        (listed && pairKey(listed.from, listed.to) === key ? listed : null)
      );
    }),
  );

  /** The edges of the selected node (its descendants folded in), at its own level. */
  readonly selectedNodeEdges = computed(() =>
    measured('selectedNodeEdges', () => {
      const id = this._selectedNodeId();
      if (!id) return nodeEdges([], '');
      const diff = this._diff()?.diff;
      const around = edgesAround(this._edges(), this._parents(), this.boxIds(), id, (edge) => {
        return diff !== undefined && edgeStatus(edge, diff) !== 'unchanged';
      });
      // The edges of the selected node all stay, whatever the layer.
      return nodeEdges(around, id);
    }),
  );

  /**
   * What each edge says apart from its shape (diff, rules, counts, label, tooltip). The states are
   * made on demand, for the edges in view only, and kept until the inputs change.
   */
  private readonly edgeStates = computed(() => {
    const translate = this._translate().t;
    const diff = this._diff()?.diff;
    const violations = this._violations();
    const context = {
      diff,
      violations,
      words: {
        new: translate('map.edges.new'),
        moved: translate('map.edges.moved'),
      },
      label: (id: string) => this.label(id),
      unit: (count: number) =>
        translate(count === 1 ? 'map.edges.links_one' : 'map.edges.links', { count }),
    };
    const cache = createEdgeStateCache(context);
    // Makes the missing states of `wanted` (one measure per batch) and returns them by edge.
    return (wanted: readonly AggregatedEdge[]): ((edge: AggregatedEdge) => EdgeState) => {
      if (wanted.some((edge) => !cache.has(edge))) {
        measured('edgeStates', () => {
          for (const edge of wanted) cache.get(edge);
        });
      }
      return (edge) => cache.get(edge);
    };
  });

  private readonly geometries = new WeakMap<
    AggregatedEdge,
    { a: Rect; b: Rect; scale: number; geometry: EdgeGeometry }
  >();

  /** The shape of an edge, made on demand: follows the layout, the last rest scale and the boxes. */
  private readonly edgeShapes = computed(() => {
    const layout = this._layout();
    const scale = this.modesScale();
    const boxes = this.boxGrid();
    this.edges();
    const cache = new Map<AggregatedEdge, EdgeShape>();
    const geometries = this.geometries;
    return (edge: AggregatedEdge, a: Rect, b: Rect): EdgeShape => {
      let shape = cache.get(edge);
      if (!shape) {
        // The curve does not depend on the boxes to avoid: kept while the rects and the scale stay.
        let kept = geometries.get(edge);
        if (!kept || kept.a !== a || kept.b !== b || kept.scale !== scale) {
          kept = { a, b, scale, geometry: edgeGeometry(a, b, scale) };
          geometries.set(edge, kept);
        }
        shape = edgeShape(a, b, boxes, scale, kept.geometry);
        cache.set(edge, shape);
      }
      return shape;
    };
  });

  /** The impact radius painted on the map: its edges keep their full rendering. */
  private readonly _impact = signal<ImpactMarks | null>(null);

  /** The edges that meet the screen (and its render margin), with what decides their rendering. */
  private readonly viewEdges = computed<DetailedEdgeLine[]>(() =>
    measured('edgeLines', () => {
      const shapes = this.edgeShapes();
      const states = this.edgeStates();
      const selected = this.selectedEdge();
      const impact = this._impact();
      const emphasis = this.selection() ? this.emphasis().edges : null;
      const layout = this._layout();
      const camera = this._cullCamera();
      const viewport = this._viewport();
      // Until the view is measured there is nothing to cut the edges against.
      const measuredView = viewport.width > 0 && viewport.height > 0;
      const inView: { edge: AggregatedEdge; a: Rect; b: Rect }[] = [];
      for (const edge of this.edges()) {
        const a = layout.nodes.get(edge.from);
        const b = layout.nodes.get(edge.to);
        if (!a || !b) continue;
        if (measuredView && !edgeInView(edgeBounds(a, b), camera, viewport, RENDER_MARGIN))
          continue;
        inView.push({ edge, a, b });
      }
      const stateOf = states(inView.map((v) => v.edge));
      const lines: DetailedEdgeLine[] = [];
      for (const { edge, a, b } of inView) {
        const shape = shapes(edge, a, b);
        const state = stateOf(edge);
        const isSelected =
          selected !== null && selected.from === edge.from && selected.to === edge.to;
        // An edge the selection singles out (linked, picked, folded) keeps its full rendering,
        // so that the common path only holds edges the selection dims.
        const onPath = onImpactPath(impact, edge.from, edge.to) || singledOut(edge, emphasis);
        lines.push({
          edge,
          shape,
          selected: isSelected,
          ...state,
          changed: edge.changed || state.status !== 'unchanged',
          onImpactPath: onPath,
        });
      }
      return lines;
    }),
  );

  private readonly partitionedEdges = computed(() => partitionEdges(this.viewEdges()));

  /** Edges in world units, in full rendering: they follow the camera through their layer. */
  readonly edgeLines = computed<EdgeLine[]>(() => this.partitionedEdges().full);

  /** The unchanged edges drawn in one common path once many are on screen. */
  readonly mergedEdgeLines = computed<EdgeLine[]>(() => this.partitionedEdges().merged);

  setImpact(impact: ImpactMarks | null): void {
    this._impact.set(impact);
  }

  /** How the selection dims the nodes and the edges; it follows the selection, not the camera. */
  readonly emphasis = computed(() =>
    measured('emphasis', () => {
      const selection = this.selection();
      const edges = this.edges();
      const modes = this.modes();
      const ids: string[] = [];
      for (const [id, mode] of modes) if (mode !== 'hidden') ids.push(id);
      const visibleOf = (id: string) => this.visibleOf(id);
      const within = (id: string, box: string) => this.within(id, box);
      return {
        nodes: nodeEmphasis(ids, edges, selection, visibleOf, new Set(), within),
        edges: edgeEmphasis(edges, selection, visibleOf, within),
      };
    }),
  );

  selectEdge(from: string, to: string): void {
    this.applyEdge(from, to);
    this.record();
  }

  private applyEdge(from: string, to: string): void {
    this._selectedNodeId.set(null);
    this._selectedFine.set(null);
    this._selectedEdgeKey.set(pairKey(from, to));
  }

  /**
   * Selects the aggregated edge that holds a fine edge. When both ends are inside one box at this
   * zoom, the map dives to the source so the edge shows up.
   */
  selectFineEdge(edge: ViolationEdge): void {
    this._selectedEdgeKey.set(null);
    this._selectedFine.set(edge);
    this._selectedNodeId.set(null);
    if (!this.selectedEdge()) this.focusNode(edge.from);
    this.record();
  }

  /** Selects an edge listed by a node: the one the map draws, else the listed one itself. */
  selectListedEdge(edge: AggregatedEdge): void {
    this.applyEdge(edge.from, edge.to);
    if (!this.selectedEdge()) this._listedEdge.set(edge);
    this.record();
  }

  clearEdgeSelection(): void {
    this._listedEdge.set(null);
    this._selectedFine.set(null);
    this._selectedEdgeKey.set(null);
  }

  /** The violations painted on the edges; none while the rules layer is off. */
  setViolations(violations: readonly Violation[]): void {
    this._violations.set(violations);
  }

  /** Selects the symbol a fine link starts from. */
  selectLink(edge: Edge): void {
    this.clearEdgeSelection();
    this._selectedNodeId.set(edge.from);
    this.record();
  }

  setCoChangeEdges(edges: Edge[]): void {
    this._coChangeEdges.set(edges);
  }

  setShowUnchangedEdges(show: boolean): void {
    this._showUnchangedEdges.set(show);
    try {
      storage()?.setItem(unchangedKey(this._reviewMode()), String(show));
    } catch {
      // The choice is just not remembered.
    }
  }

  /** Switches the mode: the layer takes the remembered choice of the mode, else its default. */
  setReviewMode(review: boolean): void {
    this._reviewMode.set(review);
    let remembered: string | null = null;
    try {
      remembered = storage()?.getItem(unchangedKey(review)) ?? null;
    } catch {
      remembered = null;
    }
    this._showUnchangedEdges.set(remembered === null ? !review : remembered === 'true');
  }

  /** Applies a diff on the map, or none (the map alone). */
  setDiff(diff: DiffResponse | null): void {
    this._diff.set(diff);
  }

  /** Gives the map the translator of the current language (it writes the edge labels). */
  setTranslator(t: (key: string, params?: Record<string, unknown>) => string): void {
    this._translate.set({ t });
  }

  /** Colours only these files (the replay of one commit), or everything the diff says (null). */
  setCommitFiles(files: ReadonlySet<string> | null): void {
    this._commitFiles.set(files);
  }

  label(id: string): string {
    return this._infos().get(id)?.label ?? id;
  }

  info(id: string): NodeInfo | undefined {
    return this._infos().get(id);
  }

  setRepoName(name: string): void {
    this._repoName.set(name);
  }

  search(query: string): SearchResult[] {
    return searchNodes(this.searchIndex(), query);
  }

  /** Whether a node is in the graph shown. */
  hasNode(id: string): boolean {
    return this._parents().has(id);
  }

  /** Runs `action` once the next graph is laid out. */
  whenShown(action: () => void): void {
    this.afterShow.push(action);
  }

  /** Selects a node without moving the camera (a click on its box). */
  selectNode(id: string): void {
    if (this.deferUntilLaidOut(() => this.selectNode(id))) return;
    this.clearEdgeSelection();
    this._selectedNodeId.set(id);
    this.record();
  }

  /** Clears the node selection (a click on empty map). */
  deselectNode(): void {
    if (this.deferUntilLaidOut(() => this.deselectNode())) return;
    this._selectedNodeId.set(null);
  }

  /** Selects a node and frames it (the file, for a symbol). */
  selectResult(id: string): void {
    if (this.deferUntilLaidOut(() => this.selectResult(id))) return;
    this.clearEdgeSelection();
    this.focusNode(id);
    this.record();
  }

  /** Back to the previous step of the navigation: selection and camera. */
  goBack(): void {
    if (this.deferUntilLaidOut(() => this.goBack())) return;
    this.restore(goBack(this._history()));
  }

  /** Forward to the next step of the navigation. */
  goForward(): void {
    if (this.deferUntilLaidOut(() => this.goForward())) return;
    this.restore(goForward(this._history()));
  }

  private restore(history: History<NavStep>): void {
    if (history === this._history()) return;
    this._history.set(history);
    const step = currentStep(history);
    if (!step) return;
    this.interrupt();
    this._zoomPoint.set(null);
    this._diveTarget.set(null);
    this._selectedNodeId.set(step.nodeId);
    this._selectedEdgeKey.set(step.edgeKey);
    this._listedEdge.set(step.listedEdge);
    this._selectedFine.set(step.fine);
    this._forcedLevel.set(step.level);
    this._cap.set(step.cap);
    this.animateTo(step.camera);
  }

  /** Adds the current selection and camera (where a flight ends) as a step. */
  private record(): void {
    this._history.update((history) =>
      pushStep(history, {
        nodeId: this._selectedNodeId(),
        edgeKey: this._selectedEdgeKey(),
        listedEdge: this._listedEdge(),
        fine: this._selectedFine(),
        camera: this.animation && this.flightTarget ? this.flightTarget : this._camera(),
        level: this._forcedLevel(),
        cap: this._cap(),
      }),
    );
  }

  private focusNode(id: string): void {
    this._selectedNodeId.set(id);
    const parent = this._parents().get(id);
    // Frame close enough for the node and its ancestors to open on screen.
    this.dive(
      this._infos().get(id)?.kind === 'symbol' && parent ? parent : id,
      FIT_OPTIONS.maxScale,
    );
  }

  selectCrumb(crumb: Crumb): void {
    if (this.deferUntilLaidOut(() => this.selectCrumb(crumb))) return;
    if (crumb.kind === 'node') this.selectResult(crumb.id);
    else if (crumb.kind === 'root') {
      this._selectedNodeId.set(null);
      this.fitAll();
    } else this.setLevel(crumb.level);
  }

  /** Closes the help, else deselects, else goes up a level, else shows everything. */
  escape(): void {
    if (this.deferUntilLaidOut(() => this.escape())) return;
    switch (
      escapeStep({
        helpOpen: this._helpOpen(),
        selectedNodeId: this._selectedNodeId(),
        selectedEdge: this.selectedEdge() !== null,
        level: this.level(),
      })
    ) {
      case 'close-help':
        this._helpOpen.set(false);
        break;
      case 'deselect':
        this._selectedNodeId.set(null);
        this.clearEdgeSelection();
        break;
      case 'level-up':
        this.setLevel(this.level() - 1);
        break;
      case 'fit-all':
        this.fitAll();
        break;
    }
  }

  openHelp(): void {
    this._helpOpen.set(true);
  }

  toggleHelp(): void {
    this._helpOpen.update((open) => !open);
  }

  setViewport(width: number, height: number): void {
    const unmeasured = this._viewport().width === 0 || this._viewport().height === 0;
    this._viewport.set({ width, height });
    if (this._layout().roots.length === 0) return;
    if (this.pristine) this.setCamera(this.fitCamera(), true);
    // A level chosen before the first measure was aimed at an empty view: aim at it again. The
    // camera is fitted first: the flight to the level starts from the current camera, and
    // interpolating from the one made for the empty view (negative scale) gives NaN.
    else if (unmeasured && width > 0 && height > 0) {
      this.setCamera(this.fitCamera(), true);
      this.setLevel(this._forcedLevel() ?? 0);
    }
  }

  async load(): Promise<void> {
    this._status.set('loading');
    try {
      const meta = await this.api.meta();
      this._repoName.set(meta.repo);
      const snapshot = await this.api.snapshot(headRef(meta.range));
      await this.show(snapshot.graph);
    } catch {
      this._status.set('error');
    }
  }

  /**
   * Lays the graph out and fits the whole map (level 0). With `keepView`, the camera and the level
   * stay where they are (the same repository seen with another diff): a camera flight to a level
   * goes on and lands on it.
   */
  show(received: GraphSnapshot, keepView = false): Promise<void> {
    this.sourceGraph = received;
    const graph = hideExternalDeps(received, this._hideExternal());
    const request = ++this.showRequest;
    if (!keepView) this.layingOut = true;
    if (this.executeLayout === onThreadExecutor) {
      this.applyShow(graph, computeLayouts(graph), keepView);
      return Promise.resolve();
    }
    return this.executeLayout(graph)
      .then((layouts) => {
        // The graph was replaced while the layouts were computed: the map keeps the newer one.
        if (request === this.showRequest) this.applyShow(graph, layouts, keepView);
      })
      .catch(() => {
        if (request === this.showRequest) this._status.set('error');
      });
  }

  /**
   * While the first layout is on its way, the actions of the user wait for it (as they would for
   * the map): `replay` is queued for the arrival and this returns true.
   */
  private deferUntilLaidOut(replay: () => void): boolean {
    if (!this.layingOut) return false;
    this.afterShow.push(replay);
    return true;
  }

  private applyShow(graph: GraphSnapshot, layouts: Layouts, keepView: boolean): void {
    this.layingOut = false;
    if (!keepView) {
      this.stopAnimation();
      this.pendingSettle = null;
    }
    this._layouts.set(layouts);
    const layout = layouts[layoutKey(this._layoutMode())];
    const before = this._targetLayout().bounds;
    this._layout.set(layout);
    this._targetLayout.set(layout);
    this._graph.set(graph);
    // `_infos`, `_edges` and `_parents` are set together: the edge aggregator and the edge states
    // built on them are made again as one when they change.
    this._infos.set(buildNodeInfos(graph));
    this._edges.set(graph.edges);
    this._testIds.set(testNodeIds(graph.nodes));
    this._parents.set(new Map(graph.nodes.map((n) => [n.id, n.parent ?? null])));
    if (!keepView) {
      this._unfoldedTests.set(new Set());
      this.clearEdgeSelection();
      this._history.update(clearHistory);
    }
    const later = this.afterShow;
    this.afterShow = [];
    if (keepView) {
      this.settle();
      if (!graph.nodes.some((n) => n.id === this._selectedNodeId())) this._selectedNodeId.set(null);
      this._status.set('ready');
      // The map grew or shrank while a level is forced: aim at the level again, on the new layout.
      const level = this._forcedLevel();
      if (level !== null && level > 0 && !sameRect(before, layout.bounds)) this.setLevel(level);
      for (const action of later) action();
      return;
    }
    this._selectedNodeId.set(null);
    this.pristine = true;
    this._forcedLevel.set(0);
    this._cap.set(0);
    this.setCamera(this.fitCamera(), true);
    this._status.set('ready');
    for (const action of later) action();
  }

  readonly edgeLabelsAlways = this._edgeLabelsAlways.asReadonly();
  readonly hoveredEdge = this._hoveredEdge.asReadonly();

  /** The edge under the pointer, for its label. */
  setHoveredEdge(edge: { from: string; to: string } | null): void {
    const current = this._hoveredEdge();
    if (current?.from === edge?.from && current?.to === edge?.to) return;
    this._hoveredEdge.set(edge);
  }

  /** Shows every edge label, or only those asked for; the choice is remembered. */
  setEdgeLabelsAlways(always: boolean): void {
    this._edgeLabelsAlways.set(always);
    const source = storage();
    if (source) writeEdgeLabelsAlways(source, always);
  }

  /** Hides or shows the external dependencies; the map is laid out again where it is. */
  setHideExternal(hide: boolean): void {
    if (hide === this._hideExternal()) return;
    this._hideExternal.set(hide);
    const source = storage();
    if (source) writeHideExternal(source, hide);
    if (this.sourceGraph.nodes.length > 0) void this.show(this.sourceGraph, true);
  }

  /** Switches the layout, animated; the choice is remembered. */
  setLayoutMode(mode: LayoutMode): void {
    if (this.deferUntilLaidOut(() => this.setLayoutMode(mode))) return;
    const previous = this._layoutMode();
    this._layoutMode.set(mode);
    const source = storage();
    if (source) writeLayoutMode(source, mode);
    const layouts = this._layouts();
    if (mode === previous || !layouts) return;
    const target = layouts[layoutKey(mode)];
    this._targetLayout.set(target);
    this.stopAnimation();
    this.pendingSettle?.();
    this.pendingSettle = null;
    const from = this._layout();
    const fromCamera = this._camera();
    // Whole-map view: the camera follows the new bounds. Elsewhere the camera stays where it is.
    const toCamera =
      this._forcedLevel() === 0
        ? fitRect(target.bounds, this._viewport(), FIT_OPTIONS)
        : fromCamera;
    const viewport = this._viewport();
    const start = performance.now();
    const settle = () => {
      this._layout.set(target);
      this.setCamera(toCamera, true);
    };
    this.pendingSettle = settle;
    const step = (now: number): void => {
      const u = Math.min(1, (now - start) / ANIMATION_MS);
      if (u >= 1) {
        this.animation = 0;
        this.pendingSettle = null;
        settle();
        return;
      }
      const eased = easeInOutCubic(u);
      this._layout.set(interpolateLayout(from, target, eased));
      this.setCamera(interpolateCamera(fromCamera, toCamera, eased, viewport), true);
      this.animation = requestAnimationFrame(step);
    };
    this.animation = requestAnimationFrame(step);
  }

  setLevel(level: number): void {
    if (this.deferUntilLaidOut(() => this.setLevel(level))) return;
    this.interrupt();
    this._zoomPoint.set(null);
    this._diveTarget.set(null);
    const fromWholeMap = this._forcedLevel() === 0;
    this._forcedLevel.set(level);
    // While the camera flies, nothing opens beyond what both the old and the new level allow:
    // no intermediate state shows boxes that neither level wants. The new cap lands at the end.
    this._cap.set(Math.min(this._cap() ?? 3, level));
    const settle = () => this._cap.set(level);
    if (level === 0) {
      this.animateTo(this.fitCamera(), settle);
      return;
    }
    const viewport = this._viewport();
    const scale = this.clampScale(this.scales()[level]);
    this.animateTo(
      levelCamera(this._layout(), this._camera(), viewport, scale, fromWholeMap),
      settle,
    );
  }

  zoomAt(factor: number, px: number, py: number): void {
    if (this.deferUntilLaidOut(() => this.zoomAt(factor, px, py))) return;
    this.interrupt();
    this._forcedLevel.set(null);
    this._cap.set(null);
    this._zoomPoint.set(factor > 1 ? { x: px, y: py } : null);
    this.setCamera(zoomAt(this._camera(), factor, px, py, this.zoomBounds()));
  }

  pan(dx: number, dy: number): void {
    if (this.deferUntilLaidOut(() => this.pan(dx, dy))) return;
    this.interrupt();
    this._zoomPoint.set(null);
    this._diveTarget.set(null);
    this.setCamera(panBy(this._camera(), dx, dy));
  }

  fitAll(): void {
    this.setLevel(0);
  }

  /** Frames a node, opening it if it can be opened. */
  dive(id: string, maxScale = 1.4): void {
    if (this.deferUntilLaidOut(() => this.dive(id, maxScale))) return;
    const node = this._layout().nodes.get(id);
    if (!node) return;
    this.interrupt();
    this._zoomPoint.set(null);
    this._diveTarget.set(id);
    this._forcedLevel.set(levelOfKind(node.kind));
    this._cap.set(null);
    const viewport = this._viewport();
    const framed = fitRect(node, viewport, { pad: 30, maxScale });
    this.animateTo(framed);
  }

  /** Frames the union of some nodes (the files of a replayed commit); `null` goes back to where the view was. */
  frameNodes(ids: readonly string[] | null): void {
    if (this.deferUntilLaidOut(() => this.frameNodes(ids))) return;
    if (ids === null) {
      const saved = this.beforeFrame;
      this.beforeFrame = null;
      if (!saved) return;
      this.interrupt();
      this._forcedLevel.set(saved.level);
      this._cap.set(null);
      this.animateTo(saved.camera);
      return;
    }
    const nodes = ids.map((id) => this._layout().nodes.get(id)).filter((n) => n !== undefined);
    if (nodes.length === 0) return;
    this.beforeFrame ??= { camera: this._camera(), level: this._forcedLevel() };
    const x = Math.min(...nodes.map((n) => n.x));
    const y = Math.min(...nodes.map((n) => n.y));
    const right = Math.max(...nodes.map((n) => n.x + n.w));
    const bottom = Math.max(...nodes.map((n) => n.y + n.h));
    this.interrupt();
    this._forcedLevel.set(levelOfKind(nodes[0].kind));
    this._cap.set(null);
    this.animateTo(
      fitRect({ x, y, w: right - x, h: bottom - y }, this._viewport(), { pad: 60, maxScale: 1.4 }),
    );
  }

  /**
   * Moves the camera. Only the transform of the layer follows at once: the modes, headers, edge
   * shapes and culling wait for the rest, a container crossing its opening threshold, or the view
   * leaving the rendered area. `rest` is the end of a move: everything is brought up to date.
   */
  private setCamera(camera: Camera, rest = false): void {
    this._camera.set(camera);
    if (rest) {
      this.settle();
      return;
    }
    if (shouldRecomputeModes(this._layout(), this._modesCamera(), camera, 0, this._cap() ?? 3)) {
      this.settle();
      return;
    }
    if (viewLeavesRenderedArea(this._cullCamera(), camera, this._viewport(), RENDER_MARGIN)) {
      this._cullCamera.set(camera);
    }
    if (this.restTimer !== null) clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => this.settle(), REST_DELAY_MS);
  }

  /** The camera is at rest: modes and culling are computed for it, when they are not already. */
  private settle(): void {
    if (this.restTimer !== null) clearTimeout(this.restTimer);
    this.restTimer = null;
    const camera = this._camera();
    const scaleChanged = camera.scale !== this._modesCamera().scale;
    if (scaleChanged) this._modesCamera.set(camera);
    // After a pan alone, culling again only pays once half the render margin is used up.
    const moved = viewLeavesRenderedArea(
      this._cullCamera(),
      camera,
      this._viewport(),
      RENDER_MARGIN / 2,
    );
    if (scaleChanged || moved) this._cullCamera.set(camera);
  }

  private fitCamera(): Camera {
    return fitRect(this._layout().bounds, this._viewport(), FIT_OPTIONS);
  }

  private zoomBounds() {
    const fit = fitScale(this._layout(), this._viewport());
    return { min: fit * 0.5, max: Math.max(MAX_SCALE, this._camera().scale) };
  }

  private clampScale(scale: number): number {
    const { min, max } = this.zoomBounds();
    return Math.max(min, Math.min(max, scale));
  }

  private interrupt(): void {
    this.pristine = false;
    this.stopAnimation();
    this.pendingSettle?.();
    this.pendingSettle = null;
  }

  private stopAnimation(): void {
    if (this.animation) cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.flightTarget = null;
  }

  private animateTo(target: Camera, onDone?: () => void): void {
    this.interrupt();
    const from = this._camera();
    const viewport = this._viewport();
    const start = performance.now();
    this.pendingSettle = onDone ?? null;
    this.flightTarget = target;
    const step = (now: number): void => {
      const u = Math.min(1, (now - start) / ANIMATION_MS);
      this.setCamera(
        u >= 1 ? target : interpolateCamera(from, target, easeInOutCubic(u), viewport),
        u >= 1,
      );
      this.animation = u < 1 ? requestAnimationFrame(step) : 0;
      if (u >= 1) {
        this.pendingSettle = null;
        onDone?.();
      }
    };
    this.animation = requestAnimationFrame(step);
  }
}

/** Whether the selection singles the edge out (linked, picked or folded), rather than dims it. */
function singledOut(
  edge: AggregatedEdge,
  emphasis: ReadonlyMap<string, EdgeEmphasis> | null,
): boolean {
  const state = emphasis?.get(edgeKey(edge.from, edge.to));
  return state !== undefined && state !== 'dim' && state !== 'normal';
}

function pairKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function layoutKey(mode: LayoutMode): keyof Layouts {
  return mode === 'raw-grid' ? 'raw' : 'optimized';
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
