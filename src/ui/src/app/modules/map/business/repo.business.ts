import { computed, inject, Injectable, PendingTasks, signal } from '@angular/core';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ApiRequestError, ReliefApiService } from '../../../core/services/relief-api.service';
import { headRef, settingsRange } from '../helpers/repo.logic';
import { ancestorIds, mergeExpanded } from '../helpers/subgraph.logic';

/** Most nodes the map asks for: the core closes the containers below. */
export const DISPLAY_BUDGET = 2000;

/** The code of the API error while no repository is opened (the message is the fallback). */
function isNoSession(error: unknown, message: string): boolean {
  return error instanceof ApiRequestError && error.code !== null
    ? error.code === 'no_session'
    : message === 'no session';
}

export type RepoStatus = 'loading' | 'error' | 'ready';

/** State of the repository shown: meta, then the snapshot of the displayed ref. */
@Injectable()
export class RepoBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _status = signal<RepoStatus>('loading');
  private readonly _error = signal<string | null>(null);
  private readonly _noSession = signal(false);
  private readonly _meta = signal<MetaResponse | null>(null);
  private readonly _snapshot = signal<SnapshotResponse | null>(null);
  private readonly _ref = signal<string | null>(null);
  private readonly _loading = signal<ReadonlySet<string>>(new Set());
  /** The containers opened on demand, asked again with each read of the snapshot. */
  private expanded: string[] = [];

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  /** relief started without a path: the welcome screen is shown instead of the map. */
  readonly noSession = this._noSession.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly snapshot = this._snapshot.asReadonly();
  /** Ids of the nodes whose content is being loaded. */
  readonly loading = this._loading.asReadonly();
  readonly repoName = computed(() => this._meta()?.repo ?? null);
  readonly range = computed(() => this._meta()?.range ?? null);
  readonly ref = this._ref.asReadonly();
  readonly isEmpty = computed(
    () => this._status() === 'ready' && (this._snapshot()?.graph.nodes.length ?? 0) === 0,
  );

  async load(): Promise<void> {
    this._status.set('loading');
    this._error.set(null);
    this._noSession.set(false);
    this.expanded = [];
    try {
      let meta = await this.api.meta();
      if (!meta.range) {
        const done = this.pending.add();
        meta = await this.withDefaultRange(meta).finally(done);
      }
      this._meta.set(meta);
      const ref = headRef(meta.range);
      this._snapshot.set(await this.api.snapshot(ref, DISPLAY_BUDGET));
      this._ref.set(ref);
      this._status.set('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._noSession.set(isNoSession(error, message));
      this._error.set(message);
      this._status.set('error');
    }
  }

  /** Without a range, the saved comparison (source merged into destination) is the range. */
  private async withDefaultRange(meta: MetaResponse): Promise<MetaResponse> {
    try {
      const settings = await this.api.settings();
      return { ...meta, range: settingsRange(settings) };
    } catch {
      // Exceptional (the core falls back to its defaults itself): keep the opening range as is.
      return meta;
    }
  }

  /**
   * Reads the snapshot of `ref` again, keeping the status: the working tree changed under us. The
   * budget and the opened containers are asked again.
   */
  async refreshSnapshot(ref: string): Promise<void> {
    if (ref !== this._ref()) this.expanded = [];
    this._snapshot.set(await this.api.snapshot(ref, DISPLAY_BUDGET, this.expanded));
    this._ref.set(ref);
  }

  /** Loads the content of a closed container. False when nothing was loaded. */
  expand(id: string): Promise<boolean> {
    return this.loadContent([id], id);
  }

  /** Loads what holds a node that is not in the graph, so that it appears. */
  reveal(id: string): Promise<boolean> {
    return this.loadContent(ancestorIds(id), id);
  }

  private async loadContent(containers: string[], marker: string): Promise<boolean> {
    const ref = this.ref();
    if (!this._snapshot() || !ref || this._loading().has(marker)) return false;
    this._loading.update((ids) => new Set(ids).add(marker));
    try {
      const expand = [...new Set([...this.expanded, ...containers])];
      const loaded = await this.api.snapshot(ref, DISPLAY_BUDGET, expand);
      const current = this._snapshot();
      if (!current) return false;
      let graph = current.graph;
      for (const id of containers) graph = mergeExpanded(graph, id, loaded.graph);
      // Another call may have answered meanwhile: keep what it opened too.
      this.expanded = [...new Set([...this.expanded, ...containers])];
      this._snapshot.set({ ...current, graph });
      return true;
    } catch {
      return false;
    } finally {
      this._loading.update((ids) => new Set([...ids].filter((id) => id !== marker)));
    }
  }
}
