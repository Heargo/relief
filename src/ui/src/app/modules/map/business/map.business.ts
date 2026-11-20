import { computed, inject, Injectable, signal } from '@angular/core';

import type {
  DiffResponse,
  Edge,
  GraphDiff,
  GraphSnapshot,
  Violation,
  ViolationEdge,
} from '../../../core/models/contract';
import { edgeViolations, type Split } from '../../rules/helpers/rules.logic';
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
  edgeShape,
  type EdgeShape,
  filterEdges,
  isAncestor,
  visibleAncestor,
} from '../helpers/edges.logic';
import {
  aggregateEdgeStatus,
  diffMarks,
  type DiffStatus,
  edgeStatus,
  type NodeMark,
} from '../../review/helpers/diff-layer.logic';
import { breadcrumbTrail, type Crumb } from '../helpers/breadcrumb.logic';
import { crossingsOfEdges, layoutCrossings } from '../helpers/crossings.logic';
import { alphabeticalOrder, optimizeOrder } from '../helpers/layout-optimize.logic';
import {
  DEFAULT_LAYOUT_MODE,
  type LayoutMode,
  readLayoutMode,
  writeLayoutMode,
} from '../helpers/layout-mode.logic';
import { interpolateLayout, layoutGraph, type MapLayout, type Rect } from '../helpers/layout.logic';
import { buildNodeInfos, type NodeInfo } from '../helpers/node-info.logic';
import { headRef } from '../helpers/repo.logic';
import { containerToLoad, zoomedBox } from '../helpers/subgraph.logic';
import {
  DEFAULT_HIDE_EXTERNAL,
  hideExternalDeps,
  readHideExternal,
  writeHideExternal,
} from '../helpers/external.logic';
import { buildSearchIndex, searchNodes, type SearchResult } from '../helpers/search.logic';
import { edgesAround, nodeEdges } from '../helpers/node-edges.logic';
import type { Selection } from '../helpers/emphasis.logic';
import { escapeStep } from '../helpers/shortcuts.logic';
import {
  computeModes,
  isInViewport,
  levelOfKind,
  type NodeMode,
} from '../helpers/visibility.logic';

export type MapStatus = 'loading' | 'error' | 'ready';

/** A node to draw, in screen pixels. */
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

/** An aggregated edge placed on screen. */
export interface EdgeLine {
  edge: AggregatedEdge;
  shape: EdgeShape;
  selected: boolean;
  /** Diff status of the edge (unchanged while the layer is off). */
  status: DiffStatus;
  /** Violating fine links of the edge; zeros while the rules layer is off. */
  violations: Split<number>;
  /** Fine links added, removed and moved by the diff; zeros while the layer is off. */
  added: number;
  removed: number;
  moved: number;
  /** The diff layer is on. */
  review: boolean;
}

/** A logical coupling edge placed on screen. */
export interface CoChangeLine {
  edge: AggregatedEdge;
  shape: EdgeShape;
}

/** Crossings of the aggregated edges (module, file and symbol levels) of the two layouts. */
export interface CrossingTotals {
  optimized: number;
  raw: number;
}

interface Layouts {
  optimized: MapLayout;
  raw: MapLayout;
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
  /** The graph as received, before the display filters. */
  private sourceGraph: GraphSnapshot = EMPTY_GRAPH;
  private readonly _crossingTotals = signal<CrossingTotals>({ optimized: 0, raw: 0 });
  private readonly _infos = signal<Map<string, NodeInfo>>(new Map());
  private readonly _camera = signal<Camera>({ scale: 1, tx: 0, ty: 0 });
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
  private readonly _diff = signal<DiffResponse | null>(null);
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

  private pristine = true;
  private beforeFrame: { camera: Camera; level: number | null } | null = null;
  private animation = 0;
  private pendingSettle: (() => void) | null = null;

  readonly status = this._status.asReadonly();
  readonly layoutMode = this._layoutMode.asReadonly();
  readonly hideExternal = this._hideExternal.asReadonly();
  readonly crossingTotals = this._crossingTotals.asReadonly();
  readonly camera = this._camera.asReadonly();
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

  readonly visibleNodes = computed<VisibleNode[]>(() => {
    const layout = this._layout();
    const camera = this._camera();
    const viewport = this._viewport();
    const modes = computeModes(layout, camera, this._cap() ?? 3);
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
        x: node.x * camera.scale + camera.tx,
        y: node.y * camera.scale + camera.ty,
        w: node.w * camera.scale,
        h: node.h * camera.scale,
        mark: marks.get(node.id) ?? null,
      });
    }
    return result;
  });

  /** The closed container the user zooms into, whose content is to be loaded; null for none. */
  readonly containerToLoad = computed<string | null>(() => {
    const graph = this._graph();
    // A flight to a node loads it; only a zoom in by the user looks at what is under the pointer
    // (a camera in flight would open every container it flies over).
    const point = this._zoomPoint();
    if (!point) return containerToLoad(graph, this._diveTarget());
    const boxes = this.visibleNodes().filter((n) => n.mode === 'box');
    const focus = zoomedBox(boxes, point, (id) => containerToLoad(graph, id) !== null);
    return containerToLoad(graph, focus);
  });

  /** Boxes the edges attach to: open or closed boxes, not the ghosts drawn inside them. */
  private readonly boxIds = computed(
    () => {
      const modes = computeModes(this._layout(), this._camera(), this._cap() ?? 3);
      const ids = new Set<string>();
      for (const [id, mode] of modes) if (mode === 'open' || mode === 'box') ids.add(id);
      return ids;
    },
    { equal: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)) },
  );

  private readonly allEdges = computed(() => {
    const diff = this._diff()?.diff;
    return aggregateEdges(this._edges(), this._parents(), this.boxIds(), {
      changed: (edge) => diff !== undefined && edgeStatus(edge, diff) !== 'unchanged',
    });
  });

  /** The logical coupling edges, aggregated for the current visibility and placed on screen. */
  readonly coChangeLines = computed<CoChangeLine[]>(() => {
    const layout = this._layout();
    const camera = this._camera();
    const boxes = this.visibleNodes().filter((n) => n.mode === 'box');
    const screen = (n: { x: number; y: number; w: number; h: number }) => ({
      x: n.x * camera.scale + camera.tx,
      y: n.y * camera.scale + camera.ty,
      w: n.w * camera.scale,
      h: n.h * camera.scale,
    });
    const lines: CoChangeLine[] = [];
    for (const edge of aggregateEdges(this._coChangeEdges(), this._parents(), this.boxIds())) {
      const a = layout.nodes.get(edge.from);
      const b = layout.nodes.get(edge.to);
      if (a && b) lines.push({ edge, shape: edgeShape(screen(a), screen(b), boxes) });
    }
    return lines;
  });

  readonly showUnchangedEdges = this._showUnchangedEdges.asReadonly();
  /** Aggregated edges for the current visibility, after the "unchanged edges" layer. */
  readonly edges = computed(() => filterEdges(this.allEdges(), this._showUnchangedEdges()));
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
  readonly selectedEdge = computed<AggregatedEdge | null>(() => {
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
  });

  /** The edges of the selected node (its descendants folded in), at its own level. */
  readonly selectedNodeEdges = computed(() => {
    const id = this._selectedNodeId();
    if (!id) return nodeEdges([], '');
    const diff = this._diff()?.diff;
    const around = edgesAround(this._edges(), this._parents(), this.boxIds(), id, (edge) => {
      return diff !== undefined && edgeStatus(edge, diff) !== 'unchanged';
    });
    return nodeEdges(filterEdges(around, this._showUnchangedEdges()), id);
  });

  /** Edges in screen pixels, following the camera. */
  readonly edgeLines = computed<EdgeLine[]>(() => {
    const layout = this._layout();
    const camera = this._camera();
    const selected = this.selectedEdge();
    const diff = this._diff()?.diff;
    const violations = this._violations();
    const lines: EdgeLine[] = [];
    const boxes = this.visibleNodes().filter((n) => n.mode === 'box');
    for (const edge of this.edges()) {
      const a = layout.nodes.get(edge.from);
      const b = layout.nodes.get(edge.to);
      if (!a || !b) continue;
      const screen = (n: typeof a) => ({
        x: n.x * camera.scale + camera.tx,
        y: n.y * camera.scale + camera.ty,
        w: n.w * camera.scale,
        h: n.h * camera.scale,
      });
      lines.push({
        edge,
        shape: edgeShape(screen(a), screen(b), boxes),
        selected: selected !== null && selected.from === edge.from && selected.to === edge.to,
        status: diff
          ? aggregateEdgeStatus(edge.links.map((link) => edgeStatus(link, diff)))
          : 'unchanged',
        violations: edgeViolations(edge.links, violations),
        ...linkCounts(edge.links, diff),
        review: diff !== undefined,
      });
    }
    return lines;
  });

  /** Crossings among the edges drawn now, for the layout the map is at (not the one in flight). */
  readonly visibleCrossings = computed(() => crossingsOfEdges(this._targetLayout(), this.edges()));

  selectEdge(from: string, to: string): void {
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
  }

  /** Selects an edge listed by a node: the one the map draws, else the listed one itself. */
  selectListedEdge(edge: AggregatedEdge): void {
    this.selectEdge(edge.from, edge.to);
    if (!this.selectedEdge()) this._listedEdge.set(edge);
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
  }

  setCoChangeEdges(edges: Edge[]): void {
    this._coChangeEdges.set(edges);
  }

  setShowUnchangedEdges(show: boolean): void {
    this._showUnchangedEdges.set(show);
  }

  /** Applies a diff on the map, or none (the map alone). */
  setDiff(diff: DiffResponse | null): void {
    this._diff.set(diff);
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
    this.clearEdgeSelection();
    this._selectedNodeId.set(id);
  }

  /** Clears the node selection (a click on empty map). */
  deselectNode(): void {
    this._selectedNodeId.set(null);
  }

  /** Selects a node and frames it (the file, for a symbol). */
  selectResult(id: string): void {
    this.clearEdgeSelection();
    this.focusNode(id);
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
    if (crumb.kind === 'node') this.selectResult(crumb.id);
    else if (crumb.kind === 'root') {
      this._selectedNodeId.set(null);
      this.fitAll();
    } else this.setLevel(crumb.level);
  }

  /** Closes the help, else deselects, else goes up a level, else shows everything. */
  escape(): void {
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
    this._viewport.set({ width, height });
    if (this.pristine && this._layout().roots.length > 0) this._camera.set(this.fitCamera());
  }

  async load(): Promise<void> {
    this._status.set('loading');
    try {
      const meta = await this.api.meta();
      this._repoName.set(meta.repo);
      const snapshot = await this.api.snapshot(headRef(meta.range));
      this.show(snapshot.graph);
    } catch {
      this._status.set('error');
    }
  }

  /**
   * Lays the graph out and fits the whole map (level 0). With `keepView`, the camera and the level
   * stay where they are (the same repository seen with another diff): a camera flight to a level
   * goes on and lands on it.
   */
  show(received: GraphSnapshot, keepView = false): void {
    this.sourceGraph = received;
    const graph = hideExternalDeps(received, this._hideExternal());
    if (!keepView) {
      this.stopAnimation();
      this.pendingSettle = null;
    }
    const layouts = this.buildLayouts(graph);
    this._layouts.set(layouts);
    this._crossingTotals.set({
      optimized: layoutCrossings(layouts.optimized, graph),
      raw: layoutCrossings(layouts.raw, graph),
    });
    const layout = layouts[layoutKey(this._layoutMode())];
    const before = this._targetLayout().bounds;
    this._layout.set(layout);
    this._targetLayout.set(layout);
    this._graph.set(graph);
    this._infos.set(buildNodeInfos(graph));
    this._edges.set(graph.edges);
    this._parents.set(new Map(graph.nodes.map((n) => [n.id, n.parent ?? null])));
    if (!keepView) this.clearEdgeSelection();
    const later = this.afterShow;
    this.afterShow = [];
    if (keepView) {
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
    this._camera.set(this.fitCamera());
    this._status.set('ready');
    for (const action of later) action();
  }

  /** Hides or shows the external dependencies; the map is laid out again where it is. */
  setHideExternal(hide: boolean): void {
    if (hide === this._hideExternal()) return;
    this._hideExternal.set(hide);
    const source = storage();
    if (source) writeHideExternal(source, hide);
    if (this.sourceGraph.nodes.length > 0) this.show(this.sourceGraph, true);
  }

  /** Switches the layout, animated; the choice is remembered. */
  setLayoutMode(mode: LayoutMode): void {
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
      this._camera.set(toCamera);
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
      this._camera.set(interpolateCamera(fromCamera, toCamera, eased, viewport));
      this.animation = requestAnimationFrame(step);
    };
    this.animation = requestAnimationFrame(step);
  }

  /**
   * "Fewer crossings" is the best of the searched order and the order of the snapshot, so it is
   * never worse than the natural one (and keeps it when nothing crosses).
   */
  private buildLayouts(graph: GraphSnapshot): Layouts {
    const searched = layoutGraph(graph, optimizeOrder(graph).order);
    const natural = layoutGraph(graph);
    const optimized =
      layoutCrossings(searched, graph) < layoutCrossings(natural, graph) ? searched : natural;
    return { optimized, raw: layoutGraph(graph, alphabeticalOrder(graph)) };
  }

  setLevel(level: number): void {
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
    this.interrupt();
    this._forcedLevel.set(null);
    this._cap.set(null);
    this._zoomPoint.set(factor > 1 ? { x: px, y: py } : null);
    this._camera.update((camera) => zoomAt(camera, factor, px, py, this.zoomBounds()));
  }

  pan(dx: number, dy: number): void {
    this.interrupt();
    this._zoomPoint.set(null);
    this._diveTarget.set(null);
    this._camera.update((camera) => panBy(camera, dx, dy));
  }

  fitAll(): void {
    this.setLevel(0);
  }

  /** Frames a node, opening it if it can be opened. */
  dive(id: string, maxScale = 1.4): void {
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
  }

  private animateTo(target: Camera, onDone?: () => void): void {
    this.interrupt();
    const from = this._camera();
    const viewport = this._viewport();
    const start = performance.now();
    this.pendingSettle = onDone ?? null;
    const step = (now: number): void => {
      const u = Math.min(1, (now - start) / ANIMATION_MS);
      this._camera.set(
        u >= 1 ? target : interpolateCamera(from, target, easeInOutCubic(u), viewport),
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

function pairKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function layoutKey(mode: LayoutMode): keyof Layouts {
  return mode === 'raw-grid' ? 'raw' : 'optimized';
}

function linkCounts(
  links: Edge[],
  diff: GraphDiff | undefined,
): { added: number; removed: number; moved: number } {
  const counts = { added: 0, removed: 0, moved: 0 };
  if (!diff) return counts;
  for (const link of links) {
    const status = edgeStatus(link, diff);
    if (status === 'added') counts.added++;
    else if (status === 'removed') counts.removed++;
    else if (status === 'moved') counts.moved++;
  }
  return counts;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
