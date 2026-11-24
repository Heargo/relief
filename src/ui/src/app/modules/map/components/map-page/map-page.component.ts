import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  computed,
  effect,
  ElementRef,
  inject,
  PendingTasks,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { InputText } from '@openng/optimus-ui/inputtext';

import { DocsBusiness } from '../../../../core/business/docs.business';
import { LanguageBusiness } from '../../../../core/business/language.business';
import { ThemeBusiness } from '../../../../core/business/theme.business';
import { PAGE_RELOAD } from '../../../../core/services/page-reload';
import { WelcomeBusiness } from '../../../welcome/business/welcome.business';
import { WelcomeComponent } from '../../../welcome/components/welcome/welcome.component';
import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { LanguageCode } from '../../../../core/constants/languages';
import { type AggregatedEdge, edgeTooltip } from '../../helpers/edges.logic';
import { DiffPanelComponent } from '../../../review/components/diff-panel/diff-panel.component';
import { DiffBusiness } from '../../../review/business/diff.business';
import { ReviewSummaryBusiness } from '../../../review/business/review-summary.business';
import { SignalsSectionComponent } from '../../../review/components/signals-section/signals-section.component';
import { StructuralOverviewComponent } from '../../../review/components/structural-overview/structural-overview.component';
import { aggregateEdgeStatus, edgeStatus } from '../../../review/helpers/diff-layer.logic';
import { ImpactBusiness } from '../../../review/business/impact.business';
import { RangePickerBusiness } from '../../../review/business/range-picker.business';
import { RangePickerComponent } from '../../../review/components/range-picker/range-picker.component';
import { ReloadBusiness } from '../../../review/business/reload.business';
import { ReadingOrderBusiness } from '../../../review/business/reading-order.business';
import { ReadingOrderSectionComponent } from '../../../review/components/reading-order-section/reading-order-section.component';
import { LayersSectionComponent } from '../../../review/components/layers-section/layers-section.component';
import { focusSet } from '../../../review/helpers/focus.logic';
import { ImpactSectionComponent } from '../../../review/components/impact-section/impact-section.component';
import { hasStructuralChange } from '../../../review/helpers/diff-panel.logic';
import { scopeDiff } from '../../../review/helpers/commit-replay.logic';
import { impactMarks } from '../../../review/helpers/impact.logic';
import { RulesBusiness } from '../../../rules/business/rules.business';
import { RuleBoxComponent } from '../../../rules/components/rule-box/rule-box.component';
import { RulesSectionComponent } from '../../../rules/components/rules-section/rules-section.component';
import {
  archiNodes,
  baseOfRange,
  faultyEdge,
  linkViolations,
  nodeViolations,
  withAncestors,
} from '../../../rules/helpers/rules.logic';
import { ExploreSectionComponent } from '../../../explore/components/explore-section/explore-section.component';
import { entryPoints, overview as overviewOf } from '../../../explore/helpers/explore.logic';
import { CoChangeBusiness } from '../../../explore/business/co-change.business';
import { coChangeEdges } from '../../../explore/helpers/co-change.logic';
import { RiskBusiness } from '../../../explore/business/risk.business';
import { HotspotsSectionComponent } from '../../../explore/components/hotspots-section/hotspots-section.component';
import { hotspots, riskLevel, riskMap } from '../../../explore/helpers/risk.logic';
import { MapBusiness } from '../../business/map.business';
import { PanelsBusiness } from '../../business/panels.business';
import { RepoComparisonsBusiness } from '../../business/repo-comparisons.business';
import { RepoComparisonsComponent } from '../repo-comparisons/repo-comparisons.component';
import { RepoBusiness } from '../../business/repo.business';
import { SubgraphBusiness } from '../../business/subgraph.business';
import { repoMetaLine } from '../../helpers/repo-meta.logic';
import { pruneLabels, toggled } from '../../helpers/label-list.logic';
import { repoBoxes, type RepoBox } from '../../helpers/repo-level.logic';
import { isPartial } from '../../../review/helpers/review-graph.logic';
import type { EdgeBundle } from '../../helpers/edge-bundles.logic';
import type { SearchResult } from '../../helpers/search.logic';
import {
  actionForKey,
  historyMove,
  isTypingTarget,
  keyLabel,
  mouseHistoryMove,
  SHORTCUTS,
} from '../../helpers/shortcuts.logic';
import { EdgeHeadComponent } from '../edge-head/edge-head.component';
import { InspectorHeaderComponent } from '../inspector-header/inspector-header.component';
import { NodeEdgesComponent } from '../node-edges/node-edges.component';
import { MapCanvasComponent } from '../map-canvas/map-canvas.component';
import { NodePanelComponent } from '../node-panel/node-panel.component';
import { EdgeUsagesComponent } from '../edge-usages/edge-usages.component';
import { EdgeUsagesBusiness } from '../../business/edge-usages.business';
import { hasCodeUsages } from '../../helpers/edge-usages.logic';

/** Level of the map at which the files are drawn: where a big review starts. */
const CHANGED_FILES_LEVEL = 2;

@Component({
  selector: 'app-map-page',
  imports: [
    TranslatePipe,
    FormsModule,
    RangePickerComponent,
    InputText,
    MapCanvasComponent,
    NodePanelComponent,
    EdgeUsagesComponent,
    InspectorHeaderComponent,
    EdgeHeadComponent,
    MenuBarComponent,
    WelcomeComponent,
    NodeEdgesComponent,
    DiffPanelComponent,
    SignalsSectionComponent,
    ImpactSectionComponent,
    LayersSectionComponent,
    RuleBoxComponent,
    RulesSectionComponent,
    ReadingOrderSectionComponent,
    StructuralOverviewComponent,
    ExploreSectionComponent,
    HotspotsSectionComponent,
    RepoComparisonsComponent,
  ],
  providers: [
    RepoBusiness,
    WelcomeBusiness,
    SubgraphBusiness,
    PanelsBusiness,
    MapBusiness,
    EdgeUsagesBusiness,
    DiffBusiness,
    ReviewSummaryBusiness,
    ImpactBusiness,
    ReadingOrderBusiness,
    ReloadBusiness,
    RangePickerBusiness,
    RepoComparisonsBusiness,
    RulesBusiness,
    RiskBusiness,
    CoChangeBusiness,
  ],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent implements OnInit {
  protected readonly repo = inject(RepoBusiness);
  protected readonly map = inject(MapBusiness);
  protected readonly usages = inject(EdgeUsagesBusiness);
  protected readonly subgraph = inject(SubgraphBusiness);
  protected readonly panels = inject(PanelsBusiness);
  protected readonly review = inject(DiffBusiness);
  protected readonly overview = inject(ReviewSummaryBusiness);
  protected readonly impactState = inject(ImpactBusiness);
  protected readonly reading = inject(ReadingOrderBusiness);
  protected readonly reloader = inject(ReloadBusiness);
  private readonly rangePicker = inject(RangePickerBusiness);
  protected readonly repoComparisons = inject(RepoComparisonsBusiness);
  protected readonly ruleState = inject(RulesBusiness);
  protected readonly riskState = inject(RiskBusiness);
  protected readonly coChangeState = inject(CoChangeBusiness);
  protected readonly docs = inject(DocsBusiness);
  protected readonly language = inject(LanguageBusiness);
  protected readonly theme = inject(ThemeBusiness);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly shortcuts = SHORTCUTS;
  protected readonly keyLabel = keyLabel;
  protected readonly query = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly activeIndex = signal(0);
  /** What the core answered for a query; the local search stands in until it does. */
  private readonly found = signal<{ query: string; results: SearchResult[] } | null>(null);
  protected readonly results = computed(() => {
    const found = this.found();
    return found && found.query === this.query() ? found.results : this.map.search(this.query());
  });

  /** The repositories of a workspace with their current branch; empty on a single repository. */
  protected readonly workspaceRepos = computed(() => {
    const snapshot = this.repo.snapshot();
    return this.repo.meta()?.workspace && snapshot ? repoBoxes(snapshot.graph) : [];
  });

  /** The repository whose label editor is open. */
  protected readonly editingRepo = signal<string | null>(null);

  protected toggleLabelEditor(name: string): void {
    this.editingRepo.update((current) => (current === name ? null : name));
  }

  /** Adds the label to the repository, or removes it when it already carries it. */
  protected async toggleRepoLabel(item: RepoBox, label: string): Promise<void> {
    const labels = toggled(item.labels, label);
    try {
      await this.repo.setRepoLabels(item.name, labels);
      // The review graph is the subgraph of the diff: it carries the labels too.
      await this.review.reload();
    } catch (error) {
      // The labels stay as they were: the header still shows what is saved.
      this.welcomeState.fail(error);
    }
  }

  protected toggleLabelFilter(label: string): void {
    this.map.setLabelFilter(toggled(this.map.labelFilter(), label));
  }

  /** The grey line after the repo name: languages and detector. */
  protected readonly repoMeta = computed(() => {
    const meta = this.repo.snapshot()?.meta;
    return meta ? repoMetaLine(meta) : '';
  });

  /** The diff has been loaded once: the map is drawn once, with its removed nodes. */
  private readonly diffSettled = signal(false);

  /** The graph drawn: the head, with what the diff removed; only once the diff is settled. */
  protected readonly graph = computed(() => {
    const snapshot = this.repo.snapshot();
    if (!snapshot || !this.diffSettled()) return null;
    return this.review.graphWithBase(snapshot.graph);
  });

  /** What the map paints for the impact of the selected node. */
  protected readonly impactMarks = computed(() => {
    const id = this.map.selectedNodeId();
    const impact = this.impactState.impact();
    const snapshot = this.repo.snapshot();
    return id && impact && snapshot ? impactMarks(snapshot.graph, id, impact) : null;
  });

  /** Every violation of the range, introduced and existing. */
  protected readonly violations = computed(() => this.overview.summary()?.violations ?? []);

  /** What the map paints of the rules: the violations, none while the layer is off. */
  protected readonly mapViolations = computed(() =>
    this.ruleState.layer() ? this.violations() : [],
  );

  /** Nodes (and the boxes holding them) with the "archi" badge; null while the layer is off. */
  protected readonly archiIds = computed(() => {
    if (!this.ruleState.layer()) return null;
    const ids = archiNodes(this.violations(), this.review.reviewMode());
    const parents = new Map(
      (this.repo.snapshot()?.graph.nodes ?? []).map((n) => [n.id, n.parent ?? null]),
    );
    return withAncestors(ids, (id) => parents.get(id));
  });

  /** The rules behind the violations of the selected edge. */
  protected readonly edgeRules = computed(() => {
    const edge = this.map.selectedEdge();
    return edge ? linkViolations(edge.links, this.violations()) : [];
  });

  /** The rules behind the violations of the selected node and what it holds. */
  protected readonly nodeRules = computed(() => {
    const id = this.map.selectedNodeId();
    return id ? nodeViolations(id, this.violations()) : [];
  });

  /** What the right panel inspects, and the subtitle of its header. */
  protected readonly inspectorKind = computed<'none' | 'node' | 'edge' | 'bundle'>(() => {
    if (this.map.selectedBundle()) return 'bundle';
    if (this.map.selectedEdge()) return 'edge';
    return this.map.selectedNodeId() ? 'node' : 'none';
  });
  protected readonly inspectorSubtitle = computed(() => {
    const bundle = this.map.selectedBundle();
    if (bundle) return this.map.label(bundle.box);
    const edge = this.map.selectedEdge();
    if (edge) return edge.kinds.join(', ');
    const id = this.map.selectedNodeId();
    const kind = id ? this.map.info(id)?.kind : undefined;
    return kind ? this.language.t(`map.kinds.${kind}`) : '';
  });
  protected readonly edgeHeuristic = computed(
    () => this.map.selectedEdge()?.links.some((l) => l.precision === 'syntactic') ?? false,
  );
  protected readonly edgeAdded = computed(() => {
    const edge = this.map.selectedEdge();
    const diff = this.mapDiff()?.diff;
    if (!edge || !diff) return false;
    return aggregateEdgeStatus(edge.links.map((l) => edgeStatus(l, diff))) === 'added';
  });

  /** What the usages section asks for: the selected edge and the side it lives on, or none. */
  private readonly usagesKey = computed(() => {
    const edge = this.map.selectedEdge();
    if (!edge || !hasCodeUsages(edge.kinds)) return null;
    const diff = this.mapDiff()?.diff;
    const removed =
      !!diff && aggregateEdgeStatus(edge.links.map((l) => edgeStatus(l, diff))) === 'removed';
    return `${removed ? 'base' : 'head'}\n${edge.from}\n${edge.to}`;
  });

  /** The line to mark when a usage opens the code of its source file. */
  protected readonly usageFocus = signal<{ file: string; line: number } | null>(null);

  protected readonly rangeBase = computed(() => baseOfRange(this.review.range()));

  /** The entry points of the head, and the overview figures, shown in exploration. */
  protected readonly entryGroups = computed(() => {
    const snapshot = this.repo.snapshot();
    return snapshot ? entryPoints(snapshot.graph) : [];
  });
  protected readonly exploreOverview = computed(() => {
    const snapshot = this.repo.snapshot();
    return snapshot ? overviewOf(snapshot) : null;
  });
  /** The riskiest symbols of the head. */
  protected readonly hotspotRows = computed(() => {
    const snapshot = this.repo.snapshot();
    return snapshot ? hotspots(snapshot.graph, this.riskState.metrics()) : [];
  });
  /** The tint step of each node while the risk layer is on; null when it is off. */
  protected readonly riskLevels = computed(() => {
    const snapshot = this.repo.snapshot();
    if (!this.riskState.layer() || !snapshot) return null;
    const risk = riskMap(snapshot.graph, this.riskState.metrics());
    return new Map([...risk].map(([id, value]) => [id, riskLevel(value)]));
  });
  protected readonly hasMetrics = computed(() => Object.keys(this.riskState.metrics()).length > 0);
  protected readonly selectedMetrics = computed(() => {
    const id = this.map.selectedNodeId();
    return (id && this.riskState.metrics()[id]) || null;
  });
  protected readonly labelOf = (id: string): string => this.map.label(id);

  /** What the step-by-step reading keeps sharp; null while it is off. */
  private readonly stepFocus = computed(() => {
    const snapshot = this.repo.snapshot();
    return snapshot ? this.reading.stepFocus(snapshot.graph) : null;
  });
  protected readonly stepElements = computed(() => this.stepFocus()?.elements ?? null);
  protected readonly stepEdges = computed(() => this.stepFocus()?.edges ?? null);

  /** The ids kept sharp by the PR focus layer; null when it is off or there is no diff. */
  protected readonly focusIds = computed(() => {
    const step = this.stepFocus();
    if (step) return step.nodes;
    const diff = this.mapDiff();
    const snapshot = this.repo.snapshot();
    if (!this.review.focusLayer() || !diff || !snapshot) return null;
    const changed = diff.diff.nodes.map((n) => n.id).filter((id) => id.includes('::sym:'));
    return focusSet(snapshot.graph, changed);
  });

  /** The ids of the entries of the list that are seen, for the boxes. */
  protected readonly seenIds = computed(() => {
    const ids = this.reading.ids().flatMap((id) => [id, ...(this.reading.groupOf(id) ?? [])]);
    return new Set(ids.filter((id) => this.reading.isSeen(id)));
  });

  /** Files that make the same change; only in review mode, where the diff is read. */
  protected readonly repeated = computed(() =>
    this.review.reviewMode() ? (this.overview.summary()?.repeated ?? []) : [],
  );

  /** What the map paints of the reading progress; none outside the review mode. */
  protected readonly reviewReading = computed(() =>
    this.review.reviewMode() ? this.reading.nodeState() : null,
  );

  /** The diff the map paints: reduced to the selected commit when there is one. */
  protected readonly mapDiff = computed(() => {
    const diff = this.review.activeDiff();
    const scope = diff ? this.reading.scope(diff.diff.edges) : null;
    return diff && scope ? scopeDiff(diff, scope) : diff;
  });

  /** The diff of the panel: the selected commit's own diff, else the range's. */
  protected readonly panelView = computed(() => {
    const commit = this.reading.commitView();
    if (commit) {
      const { diff } = commit;
      return {
        diff,
        range: commit.range,
        base: commit.base,
        head: commit.head,
        has: (id: string) => hasStructuralChange(id, diff),
      };
    }
    const diff = this.review.diff();
    if (!diff) return null;
    return {
      diff,
      range: this.review.range(),
      base: this.review.baseGraph(),
      head: this.review.headGraph(),
      has: (id: string) => this.review.hasChange(id),
    };
  });

  constructor() {
    // A label that no longer exists leaves the active filter.
    effect(() => {
      const available = this.repo.availableLabels();
      const chosen = this.map.labelFilter();
      if (available.length === 0) return;
      const kept = pruneLabels(chosen, available);
      if (kept.length !== chosen.length) untracked(() => this.map.setLabelFilter(kept));
    });
    // The unchanged edges layer has a default and a memory per mode.
    effect(() => {
      const review = this.review.reviewMode();
      untracked(() => this.map.setReviewMode(review));
    });
    // The usages follow the selected edge.
    effect(() => {
      const key = this.usagesKey();
      untracked(() => {
        if (key === null) return this.usages.clear();
        const [side, from, to] = key.split('\n');
        void this.usages.load(from, to, side as 'base' | 'head');
      });
    });
    // The search asks the core, which also knows the nodes that are not loaded.
    effect(() => {
      const query = this.query();
      untracked(() => void this.askCore(query));
    });
    // Replaying one commit colours its files only.
    effect(() => {
      const scope = this.review.activeDiff() ? this.reading.scope([]) : null;
      untracked(() => {
        this.map.setCommitFiles(scope?.files ?? null);
        this.map.frameNodes(scope ? [...scope.files] : null);
      });
    });
    // The map selection is the entry the reader opened.
    effect(() => {
      const id = this.map.selectedNodeId();
      untracked(() => {
        if (id && this.reading.has(id)) this.reading.open(id);
      });
    });
    // Step by step frames the current element and its neighbours; off, the view comes back.
    let framing = false;
    effect(() => {
      const snapshot = this.repo.snapshot();
      const ids = snapshot ? this.reading.frameIds(snapshot.graph) : null;
      untracked(() => {
        if (ids) {
          framing = true;
          this.map.frameNodes(ids, 'step');
        } else if (framing) {
          framing = false;
          this.map.frameNodes(null, 'step');
        }
      });
    });
    // The impact follows the selection and the range.
    effect(() => {
      const id = this.map.selectedNodeId();
      const range = this.review.range();
      untracked(() => void this.impactState.load(id, range));
    });
    // The metrics follow the displayed ref.
    effect(() => {
      const ref = this.repo.snapshot() ? this.repo.ref() : null;
      untracked(() => void this.riskState.load(ref));
    });
    // The logical coupling is asked once its layer is on, then follows the displayed ref.
    effect(() => {
      const ref = this.repo.snapshot() && this.coChangeState.layer() ? this.repo.ref() : null;
      untracked(() => void this.coChangeState.load(ref));
    });
    effect(() => {
      const nodes = this.repo.snapshot()?.graph.nodes ?? [];
      const edges = this.coChangeState.layer()
        ? coChangeEdges(this.coChangeState.pairs(), nodes)
        : [];
      untracked(() => this.map.setCoChangeEdges(edges));
    });
    // The rules follow the range.
    effect(() => {
      const range = this.review.range();
      untracked(() => void this.ruleState.load(range));
    });
    // The overview follows the diff: it is reloaded each time a range is read.
    effect(() => {
      if (this.review.status() === 'ready') {
        const range = this.review.range();
        untracked(() => {
          void this.overview.load(range);
          void this.reading.load(range, this.review.diff()?.diff.base);
        });
      }
    });
  }

  private readonly pending = inject(PendingTasks);
  private readonly welcomeState = inject(WelcomeBusiness);
  private readonly reloadPage = inject(PAGE_RELOAD);
  /** Why the menu could not open a repository (the welcome screen shows its own). */
  protected readonly openError = this.welcomeState.error;

  private readonly groupsToReading = effect(() => {
    const groups = this.repeated();
    untracked(() => this.reading.setRepeated(groups));
  });

  ngOnInit(): void {
    void this.start();
  }

  /** Reads the repository, then its diff; nothing more while no repository is opened. */
  protected start(): Promise<void> {
    return this.repo.load().then(() => {
      if (this.repo.noSession()) return;
      // The page is stable once the map is drawn, not as soon as the diff is read.
      const done = this.pending.add();
      return this.review
        .load(this.repo.range())
        .then(() => {
          // A big repository: the review subgraph holds the changed files, shown without a zoom.
          const diff = this.review.diff();
          if (diff?.graph && diff.diff.nodes.length > 0 && isPartial(diff.graph)) {
            this.map.whenShown(() => this.map.setLevel(CHANGED_FILES_LEVEL));
          }
          this.diffSettled.set(true);
        })
        .finally(done);
    });
  }

  /** The menu entry "Open a repository": folder picker, then the map of the chosen one. */
  protected async onOpenRepo(): Promise<void> {
    const wasOpen = !this.repo.noSession();
    if (!(await this.welcomeState.pickAndOpen())) return;
    // A map already shown holds the state of the previous repository: start the page again.
    if (wasOpen) this.reloadPage();
    else await this.start();
  }

  /** The menu entry "Open a workspace": folder picker, then the map of the chosen one. */
  protected async onOpenWorkspace(): Promise<void> {
    const wasOpen = !this.repo.noSession();
    if (!(await this.welcomeState.pickAndOpenWorkspace())) return;
    if (wasOpen) this.reloadPage();
    else await this.start();
  }

  @HostListener('window:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.rangePicker.open()) {
      this.rangePicker.close();
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const move = isTypingTarget(target) ? null : historyMove(event.key);
      if (move) {
        event.preventDefault();
        this.moveInHistory(move);
      }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isTypingTarget(target)) return;
    const action = actionForKey(event.key);
    if (!action) return;
    event.preventDefault();
    switch (action.type) {
      case 'level':
        this.map.setLevel(action.level);
        break;
      case 'search':
        this.searchInput()?.nativeElement.focus();
        break;
      case 'help':
        this.map.toggleHelp();
        break;
      case 'impact':
        this.impactState.toggleLayer();
        break;
      case 'range':
        this.rangePicker.openSide(action.side);
        break;
      case 'focus':
        this.review.setFocusLayer(!this.review.focusLayer());
        break;
      case 'reading':
        this.onReading(action.move);
        break;
      case 'escape':
        this.map.escape();
        break;
    }
  }

  protected setImpactLayer(on: boolean): void {
    this.impactState.setLayer(on);
    void this.impactState.load(this.map.selectedNodeId(), this.review.range());
  }

  protected onReading(move: 'next' | 'previous' | 'seen'): void {
    const current = this.map.selectedNodeId();
    if (this.reading.mode() === 'commit' && move !== 'seen') {
      this.reading.stepCommit(move === 'next' ? 1 : -1);
      return;
    }
    if (move === 'seen') {
      if (current && this.reading.has(current)) this.reading.toggle(current);
      return;
    }
    const target = this.reading.stepByStep()
      ? this.reading.stepCurrent(move === 'next' ? 1 : -1)
      : this.reading.step(current, move === 'next' ? 1 : -1);
    if (target) this.map.selectResult(target);
  }

  protected selectRule(ruleId: string): void {
    const edge = faultyEdge(ruleId, this.violations());
    if (edge) this.map.selectFineEdge(edge);
  }

  protected markSeenAndNext(): void {
    const current = this.map.selectedNodeId();
    if (!current || !this.reading.has(current)) return;
    const next = this.reading.markSeenAndNext(current);
    if (next) this.map.selectResult(next);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    this.searchOpen.set(true);
  }

  protected onSearchKey(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count > 0) this.activeIndex.set((this.activeIndex() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) this.activeIndex.set((this.activeIndex() + count - 1) % count);
        break;
      case 'Enter': {
        event.preventDefault();
        const result = this.results()[this.activeIndex()];
        if (result) this.pick(result.id);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.query.set('');
        this.searchOpen.set(false);
        this.searchInput()?.nativeElement.blur();
        break;
    }
  }

  /** An entry point is selected and its flow traced: what it reaches, down to the externals. */
  protected traceEntryPoint(id: string): void {
    this.impactState.setDirection('dependencies');
    this.map.selectResult(id);
  }

  private async askCore(query: string): Promise<void> {
    // What the core said of an earlier typing of the query may be out of date (a reload since).
    this.found.set(null);
    const results = await this.subgraph.search(query, this.review.range());
    if (results && query === this.query()) this.found.set({ query, results });
  }

  protected pick(id: string): void {
    void this.subgraph.reveal(id);
    this.query.set('');
    this.searchOpen.set(false);
    this.searchInput()?.nativeElement.blur();
  }

  /** `key_one` for a count of 1, else `key`: the pipe does not pick the singular on its own. */
  protected plural(key: string, count: number): string {
    return this.language.t(count === 1 ? `${key}_one` : key, { count });
  }

  protected openUsage(usage: { file: string; line: number }): void {
    this.map.selectResult(usage.file);
    this.usageFocus.set(usage);
  }

  protected clearSelection(): void {
    this.map.clearBundleSelection();
    this.map.deselectNode();
    this.map.clearEdgeSelection();
    this.usageFocus.set(null);
  }

  protected bundleTitle(bundle: EdgeBundle): string {
    return this.language.t(bundle.end === 'in' ? 'map.bundle.titleIn' : 'map.bundle.titleOut', {
      count: bundle.count,
      box: this.map.label(bundle.box),
    });
  }

  protected edgeTitle(edge: AggregatedEdge): string {
    return edgeTooltip(
      edge,
      (id) => this.map.label(id),
      (count) =>
        this.language.t(count === 1 ? 'map.edges.links_one' : 'map.edges.links', { count }),
    );
  }

  /** The back / forward buttons of a mouse (buttons 4 and 5). */
  @HostListener('window:mouseup', ['$event'])
  protected onMouseButton(event: MouseEvent): void {
    const move = mouseHistoryMove(event.button);
    if (!move) return;
    event.preventDefault();
    this.moveInHistory(move);
  }

  private moveInHistory(move: 'back' | 'forward'): void {
    if (move === 'back') this.map.goBack();
    else this.map.goForward();
  }

  @HostListener('window:focus')
  protected onWindowFocus(): void {
    void this.reloader.onWindowFocus();
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.panels.windowResized();
  }

  protected onLanguageChange(code: LanguageCode): void {
    this.language.use(code);
  }

  protected resetPanel(side: 'left' | 'right'): void {
    this.panels.reset(side);
    this.renderNow();
  }

  protected toggleRightWide(): void {
    this.panels.toggleRightWide();
    this.renderNow();
  }

  /** Panel widths follow the pointer at once, without waiting for the next scheduled render. */
  private renderNow(): void {
    this.cdr.detectChanges();
  }

  protected startDrag(side: 'left' | 'right', event: PointerEvent): void {
    event.preventDefault();
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      this.panels.drag(side, ev.clientX);
      this.renderNow();
    };
    const up = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.panels.save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
