import { computed, inject, Injectable, signal } from '@angular/core';

import type { MetaResponse, SnapshotResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { headRef } from '../helpers/repo.logic';
import { ancestorIds, mergeExpanded } from '../helpers/subgraph.logic';

/** Most nodes the map asks for: the core closes the containers below. */
const DISPLAY_BUDGET = 2000;

export type RepoStatus = 'loading' | 'error' | 'ready';

/** State of the repository shown: meta, then the snapshot of the displayed ref. */
@Injectable()
export class RepoBusiness {
  private readonly api = inject(ReliefApiService);

  private readonly _status = signal<RepoStatus>('loading');
  private readonly _error = signal<string | null>(null);
  private readonly _meta = signal<MetaResponse | null>(null);
  private readonly _snapshot = signal<SnapshotResponse | null>(null);
  private readonly _ref = signal<string | null>(null);
  private readonly _loading = signal<ReadonlySet<string>>(new Set());
  /** The containers opened on demand, asked again with each read of the snapshot. */
  private expanded: string[] = [];

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
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
    this.expanded = [];
    try {
      const meta = await this.api.meta();
      this._meta.set(meta);
      const ref = headRef(meta.range);
      this._snapshot.set(await this.api.snapshot(ref, DISPLAY_BUDGET));
      this._ref.set(ref);
      this._status.set('ready');
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));
      this._status.set('error');
    }
  }

  /**
   * Reads the snapshot of `ref` again, keeping the status: the working tree changed under us. A
   * graph that was whole and small is asked whole; else the budget and the opened containers are
   * asked again.
   */
  async refreshSnapshot(ref: string): Promise<void> {
    const graph = this._snapshot()?.graph;
    if (ref !== this._ref()) this.expanded = [];
    const whole =
      !!graph && graph.nodes.length < DISPLAY_BUDGET && !graph.nodes.some((n) => n.childCount);
    this._snapshot.set(
      whole
        ? await this.api.snapshot(ref)
        : await this.api.snapshot(ref, DISPLAY_BUDGET, this.expanded),
    );
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
