import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { measured } from '../../../../core/helpers/perf';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageBusiness } from '../../../../core/business/language.business';
import type { DiffResponse, GraphSnapshot, Violation } from '../../../../core/models/contract';
import {
  MapBusiness,
  type CoChangeLine,
  type EdgeLine,
  type VisibleNode,
} from '../../business/map.business';
import type { Crumb } from '../../helpers/breadcrumb.logic';
import { edgeSyncKey } from '../../helpers/edge-state.logic';
import { edgeLabelVisible, edgeThickness } from '../../helpers/edges.logic';
import {
  closedLabelVisible,
  headerStyle,
  headerLayout,
  type HeaderLayout,
} from '../../helpers/header.logic';
import { type EdgeEmphasis, edgeKey, type NodeEmphasis } from '../../helpers/emphasis.logic';
import { nodeContent, sizeClass } from '../../helpers/node-content.logic';
import {
  type ImpactMarks,
  type ImpactState,
  impactState,
  onImpactPath,
} from '../../../review/helpers/impact.logic';
import type { ReadingNodeState } from '../../../review/business/reading-order.business';
import { isClick } from '../../helpers/pointer.logic';
import { mergedEdgesPath, nearestEdge } from '../../helpers/edge-culling.logic';

/** Distance, in screen pixels, within which a click picks a merged edge. */
const MERGED_PICK_PX = 6;
const MERGED_TESTID = 'map-edges-merged';

/**
 * The map. Node positions are written straight into the DOM on every frame (one div per visible
 * node, no change detection per node, ADR 0002); only the level panel goes through the template.
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

  protected readonly map = inject(MapBusiness);
  private readonly language = inject(LanguageBusiness);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('layer');

  protected readonly levels = [0, 1, 2, 3];
  protected readonly statuses = ['added', 'modified', 'removed', 'moved'] as const;
  protected readonly edgeKinds = [
    { status: 'added', key: 'newEdge' },
    { status: 'removed', key: 'removedEdge' },
    { status: 'unchanged', key: 'unchangedEdge' },
  ] as const;
  private readonly edgesLayer = viewChild.required<ElementRef<SVGGElement>>('edgesLayer');
  private shown = false;
  private readonly elements = new Map<string, HTMLElement>();
  private readonly edgeElements = new Map<string, SVGGElement>();
  private readonly coChangeElements = new Map<string, SVGGElement>();
  private mergedElement: SVGPathElement | null = null;

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
      // The camera is the only thing a pan or a zoom gesture writes: one transform for both layers.
      const transform = this.map.layerTransform();
      this.layer().nativeElement.style.transform = transform;
      this.edgesLayer().nativeElement.style.transform = transform;
    });
    effect(() => {
      const nodes = this.map.visibleNodes();
      const lang = this.language.current();
      const impact = this.impact();
      const reading = this.reading();
      const focus = this.focus();
      const archi = this.archi();
      const risk = this.risk();
      const loading = this.loading();
      untracked(() => {
        measured('syncNodes', () =>
          this.sync(nodes, lang, impact, reading, focus, archi, risk, loading),
        );
      });
    });
    effect(() => {
      // The selection dims nodes and edges: it follows the selection, not the camera.
      const { nodes } = this.map.emphasis();
      this.map.visibleNodes();
      const impact = this.impact();
      untracked(() => measured('syncNodeEmphasis', () => this.syncNodeEmphasis(nodes, impact)));
    });
    effect(() => {
      const impact = this.impact();
      untracked(() => this.map.setImpact(impact));
    });
    effect(() => {
      const lines = this.map.mergedEdgeLines();
      // What is left in the common path is what a selection dims.
      const dim = this.map.selection() !== null;
      untracked(() => measured('syncMergedEdges', () => this.syncMergedEdges(lines, dim)));
    });
    effect(() => {
      const lines = this.map.edgeLines();
      const impact = this.impact();
      untracked(() => measured('syncEdges', () => this.syncEdges(lines, impact)));
    });
    effect(() => {
      const { edges } = this.map.emphasis();
      this.map.edgeLines();
      untracked(() => measured('syncEdgeEmphasis', () => this.syncEdgeEmphasis(edges)));
    });
    effect(() => {
      const lines = this.map.coChangeLines();
      untracked(() => measured('syncCoChange', () => this.syncCoChange(lines)));
    });
    afterNextRender(() => this.listen());
  }

  protected crumbText(crumb: Crumb): string {
    return crumb.kind === 'level' ? this.language.t(`map.levels.${crumb.level}`) : crumb.label;
  }

  protected zoomFromCenter(factor: number): void {
    const { width, height } = this.map.viewport();
    this.map.zoomAt(factor, width / 2, height / 2);
  }

  protected onDoubleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.map-levels, .map-crumbs, .map-legend')) return;
    const id = target?.closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
    if (id) this.map.dive(id);
  }

  /** A click without drag: a node box selects it, empty map deselects (edges have their own). */
  private onClick(target: Element | null, at: { x: number; y: number }): void {
    if (
      !target ||
      target.closest(
        `.map-levels, .map-crumbs, .map-legend, [data-from], [data-testid="${MERGED_TESTID}"]`,
      )
    )
      return;
    // The strokes of the common path are thin, and nodes may lie under them: pick by proximity.
    if (this.pickMerged(at.x, at.y)) return;
    const id = target.closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
    if (id) this.map.selectNode(id);
    else this.map.deselectNode();
  }

  /** Selects the merged edge nearest to a client point, if one is within reach. */
  private pickMerged(clientX: number, clientY: number): boolean {
    const lines = this.map.mergedEdgeLines();
    if (lines.length === 0) return false;
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    const { scale, tx, ty } = this.map.camera();
    const point = { x: (clientX - rect.left - tx) / scale, y: (clientY - rect.top - ty) / scale };
    const found = nearestEdge(
      lines.map((l) => ({ d: l.shape.d, edge: l.edge })),
      point,
      MERGED_PICK_PX / Math.abs(scale),
    );
    if (!found) return false;
    this.map.selectEdge(found.edge.from, found.edge.to);
    return true;
  }

  protected onEdgesClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.getAttribute('data-testid') === MERGED_TESTID) {
      this.pickMerged(event.clientX, event.clientY);
      return;
    }
    const edge = target?.closest<SVGElement>('[data-from]');
    const { from, to } = edge?.dataset ?? {};
    if (from && to) this.map.selectEdge(from, to);
  }

  protected startPan(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target?.closest('.map-levels, .map-crumbs, .map-legend')) return;
    let x = event.clientX;
    let y = event.clientY;
    const root = this.canvas().nativeElement;
    root.classList.add('panning');
    const move = (ev: PointerEvent) => {
      this.map.pan(ev.clientX - x, ev.clientY - y);
      x = ev.clientX;
      y = ev.clientY;
    };
    const down = { x: event.clientX, y: event.clientY };
    const up = (ev: PointerEvent) => {
      root.classList.remove('panning');
      if (isClick(down, { x: ev.clientX, y: ev.clientY }))
        this.onClick(target, { x: ev.clientX, y: ev.clientY });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private listen(): void {
    const root = this.canvas().nativeElement;
    const measure = () => this.map.setViewport(root.clientWidth, root.clientHeight);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(root);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      this.map.zoomAt(
        Math.exp(-delta * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    root.addEventListener('wheel', wheel, { passive: false });
    const hover = (event: Event) => this.ensureTooltip(event);
    this.edgesLayer().nativeElement.addEventListener('pointerover', hover);
    this.destroyRef.onDestroy(() =>
      this.edgesLayer().nativeElement.removeEventListener('pointerover', hover),
    );
    this.destroyRef.onDestroy(() => root.removeEventListener('wheel', wheel));
  }

  private sync(
    nodes: VisibleNode[],
    lang: string,
    impact: ImpactMarks | null,
    reading: ((id: string) => ReadingNodeState | null) | null,
    focus: ReadonlySet<string> | null,
    archi: ReadonlySet<string> | null,
    risk: ReadonlyMap<string, number> | null,
    loading: ReadonlySet<string>,
  ): void {
    const layer = this.layer().nativeElement;
    const seen = new Set<string>();
    // The nodes are in world units, drawn at the scale of the last rest: their content is laid out
    // in screen pixels at that scale and counter-scaled, so that at rest the layer's scale
    // brings it back to 1:1 (a zoom gesture scales the content with the layer until the rest).
    const scale = this.map.modesScale();
    for (const node of nodes) {
      seen.add(node.id);
      let el = this.elements.get(node.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'map-node';
        el.setAttribute('data-testid', 'map-node');
        el.dataset['nodeId'] = node.id;
        el.dataset['kind'] = node.kind;
        layer.appendChild(el);
        this.elements.set(node.id, el);
      }
      const geometry = `${node.x}|${node.y}|${node.w}|${node.h}|${scale}`;
      if (el.dataset['geometry'] !== geometry) {
        el.dataset['geometry'] = geometry;
        el.style.transform = `translate(${node.x}px, ${node.y}px) scale(${1 / scale})`;
        el.style.width = `${node.w * scale}px`;
        el.style.height = `${node.h * scale}px`;
      }
      const width = node.w * scale;
      const height = node.h * scale;
      const size = sizeClass(width);
      const mark = node.mark;
      const badges = mark?.badges.join(' ') ?? '';
      const inImpact = impact
        ? impact.reached.has(node.id)
          ? 'hit'
          : impact.scope.has(node.id)
            ? 'box'
            : 'dim'
        : '';
      const boxCount = impact && inImpact === 'box' ? (impact.counts.get(node.id) ?? 0) : 0;
      const progress = reading?.(node.id) ?? null;
      const readingKey = progress
        ? `${progress.seen}/${progress.count?.seen}/${progress.count?.total}`
        : '';
      const flagged = !!archi?.has(node.id);
      const faded = !!focus && !focus.has(node.id);
      if (risk) el.dataset['riskLevel'] = String(risk.get(node.id) ?? 0);
      else delete el.dataset['riskLevel'];
      if (faded) el.dataset['faded'] = 'true';
      else delete el.dataset['faded'];
      const open = node.mode === 'open' ? headerLayout(node.kind, scale) : null;
      const labelShown = open ? open.label === 'header' : closedLabelVisible(width, height);
      const headKey = open ? `${open.height.toFixed(1)}${open.label}` : '';
      const key = `${labelShown}|${headKey}|${node.mode}|${size}|${lang}|${mark?.status}|${mark?.intensity}|${mark?.oldLocation}|${badges}|${inImpact}|${boxCount}|${readingKey}|${flagged}|${loading.has(node.id)}`;
      if (el.dataset['key'] !== key) {
        el.dataset['key'] = key;
        el.dataset['mode'] = node.mode;
        el.className = `map-node k-${node.kind} ${node.mode}${open?.label === 'tab' ? ' has-tab' : ''}`;
        this.mark(el, node);
        this.fill(el, node, size, open, labelShown);
        this.impactMark(el, inImpact, boxCount);
        this.readingMark(el, progress);
        this.archiMark(el, flagged);
        this.loadingMark(el, loading.has(node.id));
        // No readable label: no meta, chips or badges either.
        if (!labelShown) el.querySelector('.hd')?.replaceChildren();
      }
    }
    for (const [id, el] of this.elements) {
      if (seen.has(id)) continue;
      el.remove();
      this.elements.delete(id);
    }
  }

  /** Selection dimming of the nodes; it never touches `data-faded` (the focus layer's). */
  private syncNodeEmphasis(
    states: ReadonlyMap<string, NodeEmphasis>,
    impact: ImpactMarks | null,
  ): void {
    for (const [id, el] of this.elements) {
      const kept = !!impact && (impact.reached.has(id) || impact.scope.has(id));
      const dim = states.get(id) === 'dim' && !kept;
      if (dim) {
        if (el.dataset['emph'] !== 'dim') el.dataset['emph'] = 'dim';
      } else if (el.dataset['emph'] !== undefined) delete el.dataset['emph'];
    }
  }

  /** Selection classes on the edge groups: out / in / picked / dim / hidden. */
  private syncEdgeEmphasis(states: ReadonlyMap<string, EdgeEmphasis>): void {
    for (const [key, group] of this.edgeElements) {
      this.applyEdgeEmphasis(group, states.get(emphasisKey(key)) ?? 'normal');
    }
  }

  private applyEdgeEmphasis(group: SVGGElement, state: EdgeEmphasis): void {
    for (const cls of EMPHASIS_CLASSES) {
      const on = cls === state;
      if (group.classList.contains(cls) !== on) group.classList.toggle(cls, on);
    }
  }

  /** The logical coupling edges: dashed lines of their own colour, not clickable. */
  private syncCoChange(lines: CoChangeLine[]): void {
    const svg = this.edgesLayer().nativeElement;
    const seen = new Set<string>();
    for (const { edge, shape } of lines) {
      const key = `${edge.from}>${edge.to}`;
      seen.add(key);
      let group = this.coChangeElements.get(key);
      if (!group) {
        group = svgEl('g', 'co-change-edge');
        group.setAttribute('data-testid', 'co-change-edge');
        group.append(svgEl('path', 'line'));
        svg.appendChild(group);
        this.coChangeElements.set(key, group);
      }
      const line = group.firstElementChild;
      line?.setAttribute('d', shape.d);
      line?.setAttribute('stroke-width', String(edgeThickness(edge.count)));
    }
    for (const [key, group] of this.coChangeElements) {
      if (seen.has(key)) continue;
      group.remove();
      this.coChangeElements.delete(key);
    }
  }

  /** The unchanged edges of a crowded screen: one path, no arrow, label or hit zone. */
  private syncMergedEdges(lines: EdgeLine[], dim: boolean): void {
    if (lines.length === 0) {
      this.mergedElement?.remove();
      this.mergedElement = null;
      return;
    }
    if (!this.mergedElement) {
      const path = svgEl('path', 'merged-edges');
      path.setAttribute('data-testid', MERGED_TESTID);
      this.edgesLayer().nativeElement.prepend(path);
      this.mergedElement = path;
    }
    this.mergedElement.classList.toggle('dim', dim);
    this.mergedElement.setAttribute('d', mergedEdgesPath(lines.map((l) => l.shape.d)));
  }

  private syncEdges(lines: EdgeLine[], impact: ImpactMarks | null): void {
    const svg = this.edgesLayer().nativeElement;
    const scale = this.map.modesScale();
    const emphasis = this.map.emphasis().edges;
    const seen = new Set<string>();
    for (const line of lines) {
      const { edge, shape, selected, status, violations, label } = line;
      const key = `${edge.from}>${edge.to}`;
      seen.add(key);
      const hl = onImpactPath(impact, edge.from, edge.to);
      const syncKey = `${edgeSyncKey(shape, line, selected, scale)}|${edge.count}|${edge.changed}|${hl}`;
      let group = this.edgeElements.get(key);
      if (group?.dataset['key'] === syncKey) continue;
      measured('edgeWrite', () => {
        if (!group) {
          group = svgEl('g', 'edge');
          group.append(
            svgEl('path', 'hit'),
            svgEl('path', 'line'),
            svgEl('path', 'arrow'),
            svgEl('g', 'tag'),
          );
          const tag = group.lastElementChild as SVGGElement;
          tag.setAttribute('data-testid', 'map-edge');
          svg.appendChild(group);
          this.edgeElements.set(key, group);
        }
        group.dataset['key'] = syncKey;
        const [hit, path, arrow, tag] = Array.from(group.children) as SVGElement[];
        group.setAttribute(
          'class',
          `edge st-${status}${selected ? ' sel' : ''}${edge.changed ? ' changed' : ''}${hl ? ' imp-path' : ''}${violations.introduced > 0 ? ' viol-new' : violations.existing > 0 ? ' viol-old' : ''}`,
        );
        this.applyEdgeEmphasis(group, emphasis.get(edgeKey(edge.from, edge.to)) ?? 'normal');
        tag?.setAttribute('data-status', status);
        for (const el of [hit, tag]) {
          el?.setAttribute('data-from', edge.from);
          el?.setAttribute('data-to', edge.to);
        }
        tag?.setAttribute('data-count', String(edge.count));
        tag?.classList.toggle('covered', shape.covered);
        hit?.setAttribute('d', shape.d);
        path?.setAttribute('d', shape.d);
        path?.setAttribute('stroke-width', String(edgeThickness(edge.count)));
        arrow?.setAttribute('d', shape.arrow);
        let text = tag?.querySelector('text');
        if (tag && edgeLabelVisible(label, shape.length)) {
          if (!text) {
            text = svgEl('text', '');
            tag.appendChild(text);
          }
          text.setAttribute('class', `el ${hl ? 'hl' : line.cls}`);
          text.textContent = label;
          // Drawn in screen pixels at the scale of the last rest, whatever the layer's scale.
          text.setAttribute('transform', `translate(${shape.mx} ${shape.my}) scale(${1 / scale})`);
        } else {
          text?.remove();
        }
        // The tooltip is made when the pointer first comes over the edge.
        group.dataset['tip'] = line.tooltip;
        for (const el of [hit, tag]) el?.querySelector('title')?.remove();
      });
    }
    for (const [key, group] of this.edgeElements) {
      if (seen.has(key)) continue;
      group.remove();
      this.edgeElements.delete(key);
    }
  }

  /** Gives the edge under the pointer its `<title>` (written on the first hover only). */
  private ensureTooltip(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    const el = target?.closest<SVGElement>('[data-from]');
    const tip = el?.closest<SVGGElement>('g.edge')?.dataset['tip'];
    if (!el || tip === undefined || el.querySelector(':scope > title')) return;
    const title = svgEl('title', '');
    title.textContent = tip;
    el.prepend(title);
  }

  /** Diff attributes and classes of a node; the former place of a moved node is its own thing. */
  private mark(el: HTMLElement, node: VisibleNode): void {
    const mark = node.mark;
    el.setAttribute('data-testid', mark?.oldLocation ? 'old-location' : 'map-node');
    if (!mark) {
      delete el.dataset['diffStatus'];
      delete el.dataset['diffBadges'];
      return;
    }
    el.dataset['diffStatus'] = mark.status;
    el.dataset['diffBadges'] = mark.badges.join(' ');
    if (mark.oldLocation) el.classList.add('old-location');
    else if (mark.status !== 'unchanged') el.classList.add('st', `st-${mark.status}`);
    el.classList.add(`int-${mark.intensity}`);
  }

  /** Impact radius: reached nodes outlined, the rest dimmed, closed boxes count what they hold. */
  private impactMark(el: HTMLElement, state: ImpactState, count: number): void {
    if (state) el.classList.add(`imp-${state}`);
    if (state === 'box' && count > 0 && el.classList.contains('box')) {
      el.querySelector('.hd')?.appendChild(
        span('bdg imp-count', this.language.t('review.impact.boxCount', { count })),
      );
    }
  }

  /** A box whose content is on its way says so. */
  private loadingMark(el: HTMLElement, loading: boolean): void {
    if (!loading) return;
    const mark = span('bdg loading', this.language.t('map.loading'));
    mark.setAttribute('data-testid', 'node-loading');
    (el.querySelector('.hd') ?? el).appendChild(mark);
  }

  /** The "archi" badge of a box that holds or touches a violating edge. */
  private archiMark(el: HTMLElement, flagged: boolean): void {
    if (!flagged) return;
    el.dataset['archi'] = 'true';
    el.querySelector('.hd')?.appendChild(span('bdg archi', this.language.t('rules.badge')));
  }

  /** Seen nodes are dimmed; a container tells how many of its entries are seen. */
  private readingMark(el: HTMLElement, state: ReadingNodeState | null): void {
    if (!state) return;
    el.dataset['seen'] = String(state.seen);
    if (state.seen) el.classList.add('seen');
    if (state.count && el.classList.contains('box')) {
      el.querySelector('.hd')?.appendChild(
        span('bdg seen-count', this.language.t('review.reading.counts', { ...state.count })),
      );
    }
  }

  private fill(
    el: HTMLElement,
    node: VisibleNode,
    size: ReturnType<typeof sizeClass>,
    open: HeaderLayout | null,
    labelShown: boolean,
  ): void {
    el.replaceChildren();
    el.removeAttribute('title');
    const info = this.map.info(node.id);
    const content = info ? nodeContent(info, node.mode, size) : null;
    if (!content) return;
    const head = document.createElement('div');
    head.className = 'hd';
    const style = open ? headerStyle(open) : null;
    if (style) {
      head.style.height = style.height;
      head.style.fontSize = style.fontSize;
      head.style.lineHeight = style.lineHeight;
      head.style.marginTop = style.marginTop;
    }
    if (!labelShown) {
      if (open?.label === 'tab' && content.label) {
        const tab = span('tab', content.label);
        tab.title = content.label;
        el.append(head, tab);
        return;
      }
      if (content.label) el.title = content.label;
      el.appendChild(head);
      return;
    }
    if (content.icon) head.appendChild(span(`ic pi ${content.icon}`, ''));
    if (content.label) head.appendChild(span('lb', content.label));
    if (content.sub) head.appendChild(span('sub', content.sub));
    for (const badge of node.mark?.badges ?? []) {
      head.appendChild(span(`bdg ${badge}`, this.language.t(`review.badges.${badge}`)));
    }
    if (content.counts.length > 0) {
      const chips = span('chips', '');
      for (const { unit, value } of content.counts) {
        const key = value === 1 ? `map.counts.${unit}_one` : `map.counts.${unit}`;
        chips.appendChild(span('', this.language.t(key, { count: value })));
      }
      head.appendChild(chips);
    }
    if (style) {
      for (const child of Array.from(head.children) as HTMLElement[]) {
        if (!child.classList.contains('lb')) child.style.fontSize = style.subFontSize;
      }
    }
    el.appendChild(head);
  }
}

const EMPHASIS_CLASSES = ['out', 'in', 'picked', 'dim', 'hidden'];

/** The emphasis key (`from\0to`) of an edge element key (`from>to`). */
function emphasisKey(key: string): string {
  const at = key.indexOf('>');
  return edgeKey(key.slice(0, at), key.slice(at + 1));
}

function span(className: string, text: string): HTMLElement {
  const el = document.createElement('span');
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className) el.setAttribute('class', className);
  return el;
}
