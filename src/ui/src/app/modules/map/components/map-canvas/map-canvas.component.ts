import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { measured } from '../../../../core/helpers/perf';
import { TranslatePipe } from '@ngx-translate/core';

import { ThemeBusiness } from '../../../../core/business/theme.business';
import { LanguageBusiness } from '../../../../core/business/language.business';
import type {
  DiffResponse,
  GraphSnapshot,
  RepeatedChange,
  Violation,
} from '../../../../core/models/contract';
import { MapBusiness } from '../../business/map.business';
import type { Crumb } from '../../helpers/breadcrumb.logic';
import { repeatedNodes } from '../../../review/helpers/repeated-changes.logic';
import type { ImpactMarks } from '../../../review/helpers/impact.logic';
import type { ReadingNodeState } from '../../../review/business/reading-order.business';
import { isClick } from '../../helpers/pointer.logic';
import { buildMapScene, type SceneRect } from '../../helpers/map-scene.logic';
import { symbolIcon } from '../../helpers/node-content.logic';
import { hitTest, type MapHit } from '../../helpers/map-hit.logic';
import { createMapPainter, readPalette, type Palette } from './map-painter';

/** Distance, in screen pixels, a pointer must move within one frame to be tested again. */
const HOVER_STEP_PX = 3;

/**
 * The map: a Canvas 2D painter draws the nodes and edges (ADR 0009), redrawn at most once per
 * frame; only the breadcrumbs, the level panel and the legend go through the template.
 */
@Component({
  selector: 'app-map-canvas',
  imports: [TranslatePipe],
  templateUrl: './map-canvas.component.html',
  styleUrl: './map-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class MapCanvasComponent {
  readonly graph = input.required<GraphSnapshot>();
  readonly repoName = input('');
  /** Diff painted on the map; null for the map alone. */
  readonly diff = input<DiffResponse | null>(null);
  /** Impact radius painted on the map; null for none. */
  readonly impact = input<ImpactMarks | null>(null);
  /** Ids kept sharp by the PR focus layer; everything else is faded. Null when the layer is off. */
  readonly focus = input<ReadonlySet<string> | null>(null);
  /** Step-by-step reading: the sharp edges, the others are faded to 10 %. Null when it is off. */
  readonly stepEdges = input<ReadonlySet<string> | null>(null);
  readonly stepElements = input<ReadonlySet<string> | null>(null);

  /** Violations painted on the edges; empty while the rules layer is off. */
  readonly violations = input<readonly Violation[]>([]);
  /** Ids of the nodes that carry the "archi" badge; null while the rules layer is off. */
  readonly archi = input<ReadonlySet<string> | null>(null);

  /** Risk step 0..4 of each node, painted as a tint; null while the risk layer is off. */
  readonly risk = input<ReadonlyMap<string, number> | null>(null);

  /** Ids of the containers whose content is being loaded. */
  readonly loading = input<ReadonlySet<string>>(new Set());

  /** Reading progress painted on the map: seen nodes dimmed, containers count what is seen. */
  readonly reading = input<((id: string) => ReadingNodeState | null) | null>(null);

  /** Groups of files that make the same change: the representative counts, the others are faded. */
  readonly repeated = input<RepeatedChange[] | undefined>(undefined);

  protected readonly map = inject(MapBusiness);
  private readonly language = inject(LanguageBusiness);
  private readonly theme = inject(ThemeBusiness);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  protected readonly levelIndexes = computed(() => this.map.levels().map((_, i) => i));

  /** Translation key of the name of a level. */
  protected levelName(level: number): string {
    return `map.levelNames.${this.map.levels()[level] ?? 'symbols'}`;
  }
  protected readonly statuses = ['added', 'modified', 'removed', 'moved'] as const;
  protected readonly edgeKinds = [
    { status: 'added', key: 'newEdge' },
    { status: 'removed', key: 'removedEdge' },
    { status: 'unchanged', key: 'unchangedEdge' },
  ] as const;
  private shown = false;
  private readonly surface = viewChild.required<ElementRef<HTMLCanvasElement>>('surface');
  private readonly painter = signal<(() => void) | null>(null);
  private frame = 0;

  constructor() {
    effect(() => {
      const graph = this.graph();
      untracked(() => {
        this.map.show(graph, this.shown);
        this.shown = true;
      });
    });
    effect(() => {
      const diff = this.diff();
      untracked(() => this.map.setDiff(diff));
    });
    effect(() => {
      const violations = this.violations();
      untracked(() => this.map.setViolations(violations));
    });
    effect(() => {
      // A new object per language: the texts written on the edges follow it.
      this.language.current();
      untracked(() => this.map.setTranslator((key, params) => this.language.t(key, params)));
    });
    effect(() => {
      const name = this.repoName();
      untracked(() => this.map.setRepoName(name));
    });
    effect(() => {
      const repeated = this.repeated();
      untracked(() => this.map.setRepeated(repeated));
    });
    effect(() => {
      const impact = this.impact();
      untracked(() => this.map.setImpact(impact));
    });
    effect(() => {
      const draw = this.painter();
      if (!draw) return;
      // What a frame depends on: any change schedules one redraw, at most once per frame.
      this.map.visibleNodes();
      this.map.edgeLines();
      this.map.mergedEdgeLines();
      this.map.emphasis();
      this.map.camera();
      this.map.viewport();
      this.map.modesScale();
      this.map.edgeLabelsAlways();
      this.map.hoveredEdge();
      this.map.selection();
      this.language.current();
      // The palette is read again when the theme changes.
      this.theme.dark();
      this.impact();
      this.reading();
      this.repeated();
      this.map.selectedNodeId();
      this.focus();
      this.stepEdges();
      this.stepElements();
      this.archi();
      this.risk();
      this.loading();
      this.map.testBadges();
      untracked(() => this.schedule(draw));
    });
    afterNextRender(() => this.listen());
    this.destroyRef.onDestroy(() => this.endPan?.());
  }

  /** The scene, rebuilt only when what it reads changes. */
  private readonly sceneMemo = computed(() => this.scene());
  private readonly nodeById = computed(() => new Map(this.sceneMemo().nodes.map((n) => [n.id, n])));
  private readonly edgeByKey = computed(
    () => new Map(this.sceneMemo().edges.map((e) => [`${e.from}\0${e.to}`, e])),
  );
  /** The "tested by N" badges, as buttons on the top right corner of the tested boxes. */
  protected readonly testedBadges = computed(() => {
    this.language.current();
    const { scale, tx, ty } = this.map.camera();
    const { width, height } = this.map.viewport();
    const unfolded = this.map.unfoldedTests();
    const badges: {
      id: string;
      label: string;
      text: string;
      open: boolean;
      x: number;
      y: number;
    }[] = [];
    for (const node of this.sceneMemo().nodes) {
      if (!node.testedBy) continue;
      const x = (node.rect.x + node.rect.w) * scale + tx;
      const y = node.rect.y * scale + ty;
      if (x < 0 || y < 0 || (width > 0 && x > width) || (height > 0 && y > height)) continue;
      const { count, added } = node.testedBy;
      badges.push({
        id: node.id,
        label: node.label,
        text: this.language.t(added > 0 ? 'map.edges.testedByNew' : 'map.edges.testedBy', {
          count,
          added,
        }),
        open: unfolded.has(node.id),
        x,
        y,
      });
    }
    return badges;
  });
  private panning = false;
  /** Ends the pan in progress (listeners on `window`), if any. */
  private endPan: (() => void) | null = null;

  /** What is under a client point, by geometry instead of the DOM. */
  private hitAt(clientX: number, clientY: number): MapHit | null {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    const { scale, tx, ty } = this.map.camera();
    const point = { x: (clientX - rect.left - tx) / scale, y: (clientY - rect.top - ty) / scale };
    return hitTest(this.sceneMemo(), point, scale);
  }

  /** Tooltip shown near the pointer, in the coordinates of the map; null when there is none. */
  protected readonly tip = signal<{ text: string; x: number; y: number } | null>(null);
  private hoverEvent: PointerEvent | null = null;
  private hoverFrame = 0;

  private hoverAt = { x: 0, y: 0 };

  /**
   * The hit-test of the hover: within a frame, a move of less than `HOVER_STEP_PX` waits for the
   * end of the frame (the browser already delivers one move per frame, so this only caps jitter).
   */
  protected onHover(event: PointerEvent): void {
    if (this.panning) return;
    const far =
      Math.hypot(event.clientX - this.hoverAt.x, event.clientY - this.hoverAt.y) >= HOVER_STEP_PX;
    if (this.hoverFrame && !far) {
      this.hoverEvent = event;
      return;
    }
    this.hoverAt = { x: event.clientX, y: event.clientY };
    this.hoverEvent = null;
    this.hover(event);
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const last = this.hoverEvent;
      this.hoverEvent = null;
      if (last) this.hover(last);
    });
  }

  protected onHoverLeave(): void {
    cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = 0;
    this.hoverEvent = null;
    this.tip.set(null);
    this.map.setHoveredEdge(null);
    this.surface().nativeElement.style.cursor = '';
  }

  private hover(event: PointerEvent): void {
    const hit = this.hitAt(event.clientX, event.clientY);
    this.surface().nativeElement.style.cursor = hit ? 'pointer' : '';
    this.map.setHoveredEdge(
      hit && (hit.kind === 'edge' || hit.kind === 'label') ? { from: hit.from, to: hit.to } : null,
    );
    let text = '';
    if (hit?.kind === 'node') {
      const node = this.nodeById().get(hit.id);
      if (node?.labelClipped) text = node.label;
    } else if (hit?.kind === 'edge' || hit?.kind === 'label') {
      text = this.edgeByKey().get(`${hit.from}\0${hit.to}`)?.tooltip ?? '';
    }
    if (!text) {
      this.tip.set(null);
      return;
    }
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    this.tip.set({ text, x: event.clientX - rect.left + 12, y: event.clientY - rect.top + 16 });
  }

  /** What the live region says about the selection. */
  protected readonly announcement = computed(() => {
    this.language.current();
    const selection = this.map.selection();
    if (!selection) return '';
    const label = (id: string) => this.nodeById().get(id)?.label ?? id;
    if (selection.kind === 'node')
      return this.language.t('map.announce.node', { name: label(selection.id) });
    return this.language.t('map.announce.edge', {
      from: label(selection.from),
      to: label(selection.to),
    });
  });

  protected onSurfaceKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const id = this.map.selectedNodeId();
    if (!id) return;
    event.preventDefault();
    this.map.dive(id);
  }

  /** Redraws on the next animation frame, once however many changes came before it. */
  private schedule(draw: () => void): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      measured('syncCanvas', draw);
    });
  }

  /** The painter of the `<canvas>` of the template, with the palette of the current theme. */
  private mountCanvas(): void {
    const el = this.surface().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let palette = readPalette(getComputedStyle(document.documentElement));
    let stale = false;
    const riskColors = () => {
      const css = getComputedStyle(document.documentElement);
      return [0, 1, 2, 3, 4].map((i) => css.getPropertyValue(`--relief-risk-${i}`).trim());
    };
    let painter = this.makePainter(ctx, palette, riskColors());
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = this.map.viewport();
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      if (stale) {
        stale = false;
        palette = readPalette(getComputedStyle(document.documentElement));
        painter = this.makePainter(ctx, palette, riskColors());
      }
      painter.paint(this.sceneMemo(), this.map.camera(), { width, height }, dpr);
    };
    this.painter.set(draw);
    // Whatever changes the theme (the app, a script, the system): read the palette again.
    const restyle = () => {
      stale = true;
      this.schedule(draw);
    };
    const observer = new MutationObserver(restyle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const dark =
      typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    dark?.addEventListener('change', restyle);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      dark?.removeEventListener('change', restyle);
    });
    // The icon font may load after the first frame: draw again once it is there.
    void document.fonts?.ready.then(() => this.schedule(draw));
    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      cancelAnimationFrame(this.hoverFrame);
    });
  }

  private makePainter(ctx: CanvasRenderingContext2D, palette: Palette, risk: string[]) {
    return createMapPainter(ctx, palette, {
      t: (key, params) => this.language.t(key, params),
      icon: (id) => {
        const info = this.map.info(id);
        return info?.kind === 'symbol' ? (ICON_GLYPHS[symbolIcon(info.subkind)] ?? null) : null;
      },
      risk,
    });
  }

  /** What is drawn, in world units, whatever draws it. */
  private scene() {
    return buildMapScene({
      nodes: this.map.visibleNodes(),
      edgeLines: this.map.edgeLines(),
      mergedEdgeLines: this.map.mergedEdgeLines(),
      coChangeLines: this.map.coChangeLines(),
      emphasis: this.map.emphasis(),
      modesScale: this.map.modesScale(),
      edgeLabels: {
        hovered: this.map.hoveredEdge(),
        selectedNode: this.map.selectedNodeId(),
        selectedEdge: this.map.selectedEdge(),
        always: this.map.edgeLabelsAlways(),
      },
      info: (id) => this.map.info(id),
      t: (key, params) => this.language.t(key, params),
      impact: this.impact(),
      reading: this.reading(),
      focus: this.focus(),
      stepEdges: this.stepEdges(),
      stepElements: this.stepElements(),
      archi: this.archi(),
      risk: this.risk(),
      loading: this.loading(),
      bundles: this.map.bundles(),
      selectedBundle: this.map.selectedBundle()?.id ?? null,
      repeated: repeatedNodes(
        this.repeated(),
        ((id) => (id === null ? null : (this.map.visibleOf(id) ?? id)))(this.map.selectedNodeId()),
      ),
      tests: { isTest: (id) => this.map.isTest(id), badges: this.map.testBadges() },
      measureLabel,
    });
  }

  /** `window.__reliefScene()`: what is drawn, with client rectangles; computed on call only. */
  private exposeScene(root: HTMLElement): void {
    const w = window as unknown as { __reliefScene?: () => unknown };
    w.__reliefScene = () => {
      const scene = this.scene();
      const rect = root.getBoundingClientRect();
      const { scale, tx, ty } = this.map.camera();
      const px = (x: number) => rect.left + x * scale + tx;
      const py = (y: number) => rect.top + y * scale + ty;
      const client = (r: SceneRect) => ({
        left: px(r.x),
        top: py(r.y),
        width: r.w * scale,
        height: r.h * scale,
      });
      return {
        nodes: scene.nodes.map(({ rect: r, tabRect, ...node }) => ({
          ...node,
          ...client(r),
          tabRect: tabRect ? client(tabRect) : null,
        })),
        edges: scene.edges.map(({ mid, labelRect, route, ...edge }) => ({
          ...edge,
          route: route ? route.map((p) => ({ x: px(p.x), y: py(p.y) })) : null,
          mid: { x: px(mid.x), y: py(mid.y) },
          labelRect: labelRect ? client(labelRect) : null,
        })),
        bundles: scene.bundles.map(({ mid, trunk, branches, ...bundle }) => ({
          ...bundle,
          mid: { x: px(mid.x), y: py(mid.y) },
        })),
      };
    };
    this.destroyRef.onDestroy(() => delete w.__reliefScene);
  }

  protected crumbText(crumb: Crumb): string {
    return crumb.kind === 'level' ? this.language.t(this.levelName(crumb.level)) : crumb.label;
  }

  protected zoomFromCenter(factor: number): void {
    const { width, height } = this.map.viewport();
    this.map.zoomAt(factor, width / 2, height / 2);
  }

  protected onDoubleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.map-levels, .map-crumbs, .map-legend, .map-tested')) return;
    const hit = this.hitAt(event.clientX, event.clientY);
    if (hit?.kind === 'node') this.map.dive(hit.id);
  }

  /** A click without drag: a node box selects it, an edge too, empty map deselects. */
  private onClick(target: Element | null, at: { x: number; y: number }): void {
    if (!target || target.closest('.map-levels, .map-crumbs, .map-legend, .map-tested')) return;
    // The strokes of the common path are thin, and nodes may lie under them: pick by proximity.
    const hit = this.hitAt(at.x, at.y);
    if (hit?.kind === 'node') this.map.selectNode(hit.id);
    else if (hit?.kind === 'bundle') this.map.selectBundle(hit.id);
    else if (hit) this.map.selectEdge(hit.from, hit.to);
    else this.map.deselectNode();
  }

  protected startPan(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target?.closest('.map-levels, .map-crumbs, .map-legend, .map-tested'))
      return;
    let x = event.clientX;
    let y = event.clientY;
    const root = this.canvas().nativeElement;
    root.classList.add('panning');
    this.panning = true;
    this.map.setHoveredEdge(null);
    this.tip.set(null);
    const move = (ev: PointerEvent) => {
      this.map.pan(ev.clientX - x, ev.clientY - y);
      x = ev.clientX;
      y = ev.clientY;
    };
    const down = { x: event.clientX, y: event.clientY };
    const stop = () => {
      root.classList.remove('panning');
      this.panning = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.endPan = null;
    };
    const up = (ev: PointerEvent) => {
      stop();
      if (isClick(down, { x: ev.clientX, y: ev.clientY }))
        this.onClick(target, { x: ev.clientX, y: ev.clientY });
    };
    this.endPan = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private listen(): void {
    const root = this.canvas().nativeElement;
    this.mountCanvas();
    this.exposeScene(root);
    const measure = () => this.map.setViewport(root.clientWidth, root.clientHeight);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(root);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      this.tip.set(null);
      const rect = root.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      this.map.zoomAt(
        Math.exp(-delta * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    root.addEventListener('wheel', wheel, { passive: false });
    this.destroyRef.onDestroy(() => root.removeEventListener('wheel', wheel));
  }
}

/** Glyphs of the icon font for the icon classes of the symbols (`openng-icons.css`). */
const ICON_GLYPHS: Record<string, string> = {
  'pi-objects-column': '\uea12',
  'pi-code': '\ue9e7',
  'pi-link': '\ue9c1',
  'pi-box': '\ue9d9',
  'pi-wrench': '\ue9ff',
  'pi-tag': '\ue95e',
  'pi-lock': '\ue95f',
  'pi-directions': '\ue9a6',
  'pi-table': '\ue969',
  'pi-clock': '\ue940',
  'pi-circle-fill': '\ue9dd',
};

let measureCtx: CanvasRenderingContext2D | null = null;

/** Width in pixels of a text in a CSS font, by Canvas 2D. */
function measureLabel(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
