import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';

import type { LogEntry } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { RepoBusiness } from '../../map/business/repo.business';
import { WORKTREE_RANGE, currentRange } from '../helpers/diff-layer.logic';
import {
  filterRefs,
  formatRange,
  inRange,
  type Mark,
  moveActive,
  nextTab,
  parseRange,
  type RangeParts,
  type RangeTab,
  rangeArrow,
  rangeCount,
  readingLine,
  shortcutRefs,
} from '../helpers/range.logic';
import { DiffBusiness } from './diff.business';

export type RangeSide = 'base' | 'head';

/** Most commits the rail of the Commits tab reads. */
const LOG_LIMIT = 500;

/** A row of the popover that Enter can pick. */
export interface RangeChoice {
  kind: 'ref' | 'commit';
  value: string;
}

/** State of the range control: the two sides, the popover of one of them and the commit count. */
@Injectable()
export class RangePickerBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly diff = inject(DiffBusiness);
  private readonly repo = inject(RepoBusiness);

  private readonly _open = signal<RangeSide | null>(null);
  private readonly _tab = signal<RangeTab>('branches');
  private readonly _query = signal('');
  private readonly _active = signal(0);
  private readonly _history = signal<LogEntry[]>([]);
  private readonly _shas = signal<{ base: string | null; head: string | null }>({
    base: null,
    head: null,
  });
  private readonly _found = signal<{ query: string; entries: LogEntry[] } | null>(null);
  private token = 0;
  private searchToken = 0;

  readonly open = this._open.asReadonly();
  readonly tab = this._tab.asReadonly();
  readonly query = this._query.asReadonly();
  readonly active = this._active.asReadonly();

  readonly parts = computed<RangeParts>(() => parseRange(currentRange(this.diff.range())));
  readonly headIsWorktree = computed(() => this.parts().head === WORKTREE_RANGE);
  readonly arrow = computed(() => rangeArrow(this.parts().mergeBase));
  /** What the map shows for the range; null until the diff is loaded. */
  readonly reading = computed(() => {
    const resolved = this.diff.diff()?.baseResolved;
    return resolved ? readingLine(this.parts(), resolved) : null;
  });
  /** Number of commits of the range; null while unknown. */
  readonly count = computed(() => {
    const { base, head } = this._shas();
    return base && head ? rangeCount(this._history(), base, head) : null;
  });

  private readonly marks = computed(() => {
    const { base, head } = this._shas();
    const history = this._history();
    const marks = new Map<string, Mark>();
    if (!base || !head) return marks;
    inRange(history, base, head).forEach((mark, i) => marks.set(history[i].sha, mark));
    return marks;
  });

  /** The commits of the Commits tab, each with its place in the range. */
  readonly commits = computed(() => {
    const found = this._found();
    const query = this._query().trim();
    const entries = query && found?.query === query ? found.entries : this._history();
    const marks = this.marks();
    return entries.map((entry) => ({ entry, mark: marks.get(entry.sha) ?? ('out' as Mark) }));
  });

  readonly shortcuts = computed(() => {
    const side = this._open();
    const meta = this.repo.meta();
    return side ? shortcutRefs(side, meta?.branches ?? [], meta?.tags ?? []) : [];
  });

  readonly branches = computed(() => filterRefs(this.repo.meta()?.branches ?? [], this._query()));
  readonly tags = computed(() => filterRefs(this.repo.meta()?.tags ?? [], this._query()));

  /** Everything Enter can pick, in the order shown. */
  readonly choices = computed<RangeChoice[]>(() => {
    const shortcuts = this.shortcuts().map((value) => ({ kind: 'ref' as const, value }));
    switch (this._tab()) {
      case 'branches':
        return [...shortcuts, ...this.branches().map((value) => ({ kind: 'ref' as const, value }))];
      case 'tags':
        return [...shortcuts, ...this.tags().map((value) => ({ kind: 'ref' as const, value }))];
      case 'commits':
        return [
          ...shortcuts,
          ...this.commits().map(({ entry }) => ({ kind: 'commit' as const, value: entry.sha })),
        ];
    }
  });

  constructor() {
    effect(() => {
      const parts = this.parts();
      if (!this.repo.meta()) return;
      untracked(() => void this.readHistory(parts));
    });
  }

  openSide(side: RangeSide): void {
    if (this._open() === side) return this.close();
    this._open.set(side);
    this._tab.set('branches');
    this._query.set('');
    this._active.set(0);
    this._found.set(null);
    void this.readHistory(this.parts());
  }

  close(): void {
    this._open.set(null);
  }

  setTab(tab: RangeTab): void {
    this._tab.set(tab);
    this._active.set(0);
  }

  nextTab(): void {
    this.setTab(nextTab(this._tab()));
  }

  setQuery(query: string): void {
    this._query.set(query);
    this._active.set(0);
    const text = query.trim();
    const token = ++this.searchToken;
    if (!text) {
      this._found.set(null);
      return;
    }
    void this.api
      .log(this.headRev(), LOG_LIMIT, text)
      .then((response) => {
        if (token === this.searchToken) this._found.set({ query: text, entries: response.entries });
      })
      .catch(() => {
        if (token === this.searchToken) this._found.set({ query: text, entries: [] });
      });
  }

  move(delta: 1 | -1): void {
    this._active.update((i) => moveActive(i, delta, this.choices().length));
  }

  setActive(index: number): void {
    this._active.set(index);
  }

  pickActive(): void {
    const choice = this.choices()[this._active()];
    if (choice) void this.pick(choice.value);
  }

  /** Sets the open side to a ref or a SHA and closes the popover. */
  async pick(value: string): Promise<void> {
    const side = this._open();
    if (!side) return;
    this.close();
    await this.diff.setRange(formatRange({ ...this.parts(), [side]: value }));
  }

  async swap(): Promise<void> {
    const parts = this.parts();
    if (parts.head === WORKTREE_RANGE) return;
    await this.diff.setRange(formatRange({ ...parts, base: parts.head, head: parts.base }));
  }

  async toggleMode(): Promise<void> {
    const parts = this.parts();
    if (parts.head === WORKTREE_RANGE) return;
    await this.diff.setRange(formatRange({ ...parts, mergeBase: !parts.mergeBase }));
  }

  private headRev(): string {
    const head = this.parts().head;
    return head === WORKTREE_RANGE ? 'HEAD' : head;
  }

  private async readHistory(parts: RangeParts): Promise<void> {
    const token = ++this.token;
    const headRev = parts.head === WORKTREE_RANGE ? 'HEAD' : parts.head;
    try {
      const [history, base] = await Promise.all([
        this.api.log(headRev, LOG_LIMIT),
        this.api.log(parts.base, 1),
      ]);
      if (token !== this.token) return;
      this._history.set(history.entries);
      this._shas.set({
        base: base.entries[0]?.sha ?? null,
        head: history.entries[0]?.sha ?? null,
      });
    } catch {
      if (token !== this.token) return;
      this._history.set([]);
      this._shas.set({ base: null, head: null });
    }
  }
}
