import { computed, inject, Injectable, PendingTasks, signal } from '@angular/core';

import type {
  DiffResponse,
  GraphSnapshot,
  ReadingItem,
  RepeatedChange,
} from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DISPLAY_BUDGET } from '../../map/business/repo.business';
import { baseContainers } from '../helpers/review-graph.logic';
import {
  type ChangedSymbols,
  containerProgress,
  changedSymbols,
  isSeen,
  nextUnseen,
  type Progress,
  progress,
  step,
  toggleSeen,
} from '../helpers/reading-order.logic';
import { collapseRepeated } from '../helpers/repeated-changes.logic';
import {
  type CommitEntry,
  type CommitScope,
  commitDiffRange,
  commitProgress,
  commitScope,
  stepCommit,
} from '../helpers/commit-replay.logic';

export type ReadingMode = 'file' | 'symbol' | 'commit';

/** A commit of the list with how many of its files are seen. */
export type CommitRow = CommitEntry & { progress: Progress };

/** The diff of the selected commit alone, with the graphs of its two sides. */
export interface CommitView {
  range: string;
  diff: DiffResponse;
  base: GraphSnapshot | null;
  head: GraphSnapshot | null;
}

/** What the map shows of an entry or a container: seen, and x/y of what it holds. */
export interface ReadingNodeState {
  seen: boolean;
  count: Progress | null;
}

/** State of the reading order: the lists, the mode and what is seen (kept by the core). */
@Injectable()
export class ReadingOrderBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _mode = signal<ReadingMode>('file');
  private readonly _files = signal<ReadingItem[]>([]);
  private readonly _symbols = signal<ReadingItem[]>([]);
  private readonly _commits = signal<CommitEntry[]>([]);
  private readonly _selectedCommit = signal<string | null>(null);
  private readonly _commitView = signal<CommitView | null>(null);
  private readonly _seen = signal<string[]>([]);
  private readonly _repeated = signal<RepeatedChange[]>([]);
  private readonly _persisted = signal(true);
  private range = 'HEAD';
  private token = 0;
  private viewToken = 0;
  private base = '';
  private saving: Promise<void> = Promise.resolve();

  readonly mode = this._mode.asReadonly();
  /** False once saving failed (no data folder): the progress lives in memory only. */
  readonly persisted = this._persisted.asReadonly();
  readonly items = computed(() =>
    this._mode() === 'symbol' ? this._symbols() : collapseRepeated(this._files(), this._repeated()),
  );
  readonly selectedCommit = this._selectedCommit.asReadonly();
  /** The diff of the selected commit alone; null with no commit selected or while it loads. */
  readonly commitView = this._commitView.asReadonly();
  readonly commitRows = computed<CommitRow[]>(() =>
    this._commits().map((c) => ({
      ...c,
      progress: commitProgress(c, this._seen(), this.changed()),
    })),
  );
  readonly ids = computed(() => this.items().map((i) => i.id));
  readonly changed = computed<ChangedSymbols>(() => changedSymbols(this._files(), this._symbols()));
  readonly progress = computed(() => progress(this.ids(), this._seen(), this.changed()));

  /** The groups of files that make the same change: each is one entry of the file list. */
  setRepeated(groups: RepeatedChange[]): void {
    this._repeated.set(groups);
  }

  /** The members of the group `id` represents; null for any other id. */
  groupOf(id: string): string[] | null {
    return this._repeated().find((g) => g.representative === id)?.members ?? null;
  }

  /** Marks every member of the group `id` represents seen. */
  markGroup(id: string): void {
    const members = this.groupOf(id);
    if (!members) return;
    let seen = this._seen();
    const changed = this.changed();
    for (const member of members) {
      if (!isSeen(seen, member, changed)) seen = toggleSeen(seen, member, changed);
    }
    this.save(seen);
  }

  setMode(mode: ReadingMode): void {
    this._mode.set(mode);
    if (mode !== 'commit') this.selectCommit(null);
  }

  /** What the map colours for the selected commit; null with none selected. */
  scope(edges: Parameters<typeof commitScope>[1]): CommitScope | null {
    const entry = this._commits().find((c) => c.commit === this._selectedCommit());
    return entry ? commitScope(entry, edges) : null;
  }

  /** Selects a commit (the same one again, or null, removes the filter) and reads its own diff. */
  selectCommit(commit: string | null): void {
    const next = commit === this._selectedCommit() ? null : commit;
    this._selectedCommit.set(next);
    this._commitView.set(null);
    const token = ++this.viewToken;
    const range = next ? commitDiffRange(this._commits(), next, this.base) : null;
    if (range) void this.loadView(range, token);
  }

  stepCommit(direction: 1 | -1): void {
    const target = stepCommit(this._commits(), this._selectedCommit(), direction);
    if (target && target !== this._selectedCommit()) this.selectCommit(target);
  }

  /** Loads the lists and the saved state of `range`; a failure leaves what could not be read empty. */
  async load(range: string | null, base = '', keepCommit = false): Promise<void> {
    const done = this.pending.add();
    try {
      await this.read(range, base, keepCommit);
    } finally {
      done();
    }
  }

  private async read(range: string | null, base: string, keepCommit: boolean): Promise<void> {
    const token = ++this.token;
    this.range = range ?? 'HEAD';
    this.base = base;
    const [files, symbols, commits, state] = await Promise.all([
      this.attempt(() => this.api.readingOrder('file', range)),
      this.attempt(() => this.api.readingOrder('symbol', range)),
      this.attempt(() => this.api.commitReading(range)),
      this.attempt(() => this.api.reviewState(this.range)),
    ]);
    if (token !== this.token) return;
    this._files.set(files?.items ?? []);
    this._symbols.set(symbols?.items ?? []);
    this._commits.set(commits?.commits ?? []);
    if (!keepCommit || !commits?.commits.some((c) => c.commit === this._selectedCommit())) {
      this._selectedCommit.set(null);
      this._commitView.set(null);
    }
    this._seen.set(state?.seen ?? []);
    this._persisted.set(state !== null);
  }

  isSeen(id: string): boolean {
    return isSeen(this._seen(), id, this.changed());
  }

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  toggle(id: string): void {
    this.save(toggleSeen(this._seen(), id, this.changed()));
  }

  /** Marks `id` seen (when it is not yet) and returns the next unseen entry. */
  markSeenAndNext(id: string): string | null {
    if (!this.isSeen(id)) this.toggle(id);
    return nextUnseen(this.ids(), id, this._seen(), this.changed());
  }

  step(current: string | null, direction: 1 | -1): string | null {
    return step(this.ids(), current, direction);
  }

  /** What the map paints for a node: an entry of the list, or a container of entries. */
  readonly nodeState = computed<(id: string) => ReadingNodeState | null>(() => {
    const seen = this._seen();
    const changed = this.changed();
    const files = this._files().map((i) => i.id);
    const entries = new Set([...files, ...this._symbols().map((i) => i.id)]);
    return (id) => {
      if (entries.has(id)) return { seen: isSeen(seen, id, changed), count: null };
      const count = containerProgress(id, files, seen, changed);
      return count.total > 0 ? { seen: count.seen === count.total, count } : null;
    };
  });

  private async loadView(range: string, token: number): Promise<void> {
    const diff = await this.attempt(() => this.api.diff(range, DISPLAY_BUDGET));
    if (!diff) return;
    const [base, head] = diff.graph
      ? [await this.attempt(() => this.baseOf(diff)), diff.graph]
      : await Promise.all([
          this.attempt(async () => (await this.api.snapshot(diff.diff.base)).graph),
          this.attempt(async () => (await this.api.snapshot(diff.diff.head)).graph),
        ]);
    if (token === this.viewToken) this._commitView.set({ range, diff, base, head });
  }

  /** The base graph, opened down to what the diff touches; none when it only adds. */
  private async baseOf(diff: DiffResponse): Promise<GraphSnapshot | null> {
    const expand = baseContainers(diff);
    if (expand.length === 0) return null;
    return (await this.api.snapshot(diff.diff.base, DISPLAY_BUDGET, expand)).graph;
  }

  /** The result of an API call, or null when it fails. */
  private async attempt<T>(call: () => Promise<T>): Promise<T | null> {
    try {
      return await call();
    } catch {
      return null;
    }
  }

  private save(seen: string[]): void {
    this._seen.set(seen);
    const range = this.range;
    this.saving = this.saving
      .then(async () => this.api.setReviewState(range, { seen }))
      .then(
        () => undefined,
        () => this._persisted.set(false),
      );
  }
}
