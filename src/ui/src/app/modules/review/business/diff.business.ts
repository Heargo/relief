import { computed, inject, Injectable, PendingTasks, signal } from '@angular/core';
import { Router } from '@angular/router';

import type { DiffResponse, GraphSnapshot } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { MapBusiness } from '../../map/business/map.business';
import { RepoBusiness } from '../../map/business/repo.business';
import { headRef } from '../../map/helpers/repo.logic';
import { exploreView } from '../../explore/helpers/explore.logic';
import { prStats } from '../helpers/diff-layer.logic';
import { hasStructuralChange } from '../helpers/diff-panel.logic';

export type DiffLoadStatus = 'loading' | 'error' | 'ready';

/** State of the PR diff: the range (kept in `?range=`), the loaded diff and the layers on the map. */
@Injectable()
export class DiffBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly router = inject(Router);
  private readonly pending = inject(PendingTasks);
  private readonly repo = inject(RepoBusiness, { optional: true });
  private readonly map = inject(MapBusiness, { optional: true });

  private readonly _status = signal<DiffLoadStatus>('loading');
  private readonly _error = signal<string | null>(null);
  private readonly _range = signal<string | null>(null);
  private readonly _diff = signal<DiffResponse | null>(null);
  private readonly _base = signal<GraphSnapshot | null>(null);
  private readonly _head = signal<GraphSnapshot | null>(null);
  private token = 0;
  private readonly _reviewMode = signal(true);
  private readonly _showDiffLayer = signal(true);
  private readonly _focusLayer = signal(false);

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly range = this._range.asReadonly();
  readonly diff = this._diff.asReadonly();
  /** The base graph of the diff, for the line numbers of the base side. */
  readonly baseGraph = this._base.asReadonly();
  /** The head graph of the range, for the line numbers of the head side. */
  readonly headGraph = this._head.asReadonly();
  readonly reviewMode = this._reviewMode.asReadonly();
  readonly showDiffLayer = this._showDiffLayer.asReadonly();
  /** The PR focus layer: what is not changed nor next to a change is faded. */
  readonly focusLayer = this._focusLayer.asReadonly();
  /** The diff the map applies: none when "Relire la PR" or the diff layer is off. */
  readonly activeDiff = computed(() =>
    this._reviewMode() && this._showDiffLayer() ? this._diff() : null,
  );
  readonly stats = computed(() => {
    const diff = this._diff();
    return diff ? prStats(diff) : null;
  });

  /** The diff has something to show for this node: a changed symbol, or a changed file. */
  hasChange(id: string): boolean {
    const diff = this._diff();
    return diff ? hasStructuralChange(id, diff) : false;
  }

  /** Loads the range of the URL, else `defaultRange` (the one the server was opened with). */
  async load(defaultRange: string | null): Promise<void> {
    const value = this.router.parseUrl(this.router.url).queryParams['range'];
    await this.fetch(typeof value === 'string' && value ? value : defaultRange);
  }

  /** Changes the range: reloads the diff and writes the range in the URL. */
  async setRange(range: string): Promise<void> {
    if (range === this._range()) return;
    await this.router.navigate([], {
      queryParams: { range },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    await this.fetch(range);
    await this.followHead(range);
  }

  /** The map draws the head of the new range, keeping its view. */
  private async followHead(range: string): Promise<void> {
    if (!this.repo || !this.map || this._range() !== range) return;
    try {
      await this.repo.refreshSnapshot(headRef(range));
      const snapshot = this.repo.snapshot();
      if (snapshot && this._range() === range) {
        this.map.show(this.graphWithBase(snapshot.graph), true);
      }
    } catch {
      // The map stays as it was.
    }
  }

  /** Reads the diff of the current range again. */
  async reload(): Promise<void> {
    await this.fetch(this._range(), true);
  }

  setReviewMode(on: boolean): void {
    this._reviewMode.set(on);
  }

  setShowDiffLayer(show: boolean): void {
    this._showDiffLayer.set(show);
  }

  setFocusLayer(on: boolean): void {
    this._focusLayer.set(on);
  }

  /** The graph to draw: the head alone when "Relire la PR" is off, else the head plus what the diff says was removed or moved away. */
  graphWithBase(head: GraphSnapshot): GraphSnapshot {
    const diff = this._diff();
    const base = this._base();
    return exploreView(this._reviewMode() ? 'review' : 'explore', head, base, diff).graph;
  }

  private async fetch(range: string | null, quiet = false): Promise<void> {
    // Pending task: the page is stable once the diff and both side graphs are read.
    const done = this.pending.add();
    try {
      await this.fetchDiff(range, quiet);
    } finally {
      done();
    }
  }

  private async fetchDiff(range: string | null, quiet: boolean): Promise<void> {
    const token = ++this.token;
    if (!quiet) {
      this._status.set('loading');
      this._error.set(null);
    }
    this._range.set(range);
    try {
      const diff = await this.api.diff(range);
      const [base, head] = await Promise.all([
        this.loadSnapshot(diff.diff.base),
        this.loadSnapshot(diff.diff.head),
      ]);
      if (token !== this.token) return;
      this._base.set(base);
      this._head.set(head);
      this._diff.set(diff);
      this._error.set(null);
      this._status.set('ready');
    } catch (error) {
      if (token !== this.token) return;
      // A quiet reload that fails leaves what is shown as it is.
      if (quiet) return;
      this._diff.set(null);
      this._base.set(null);
      this._head.set(null);
      this._error.set(error instanceof Error ? error.message : String(error));
      this._status.set('error');
    }
  }

  /** A side graph only helps to draw removed things and to number lines: failing to read it is not an error. */
  private async loadSnapshot(ref: string): Promise<GraphSnapshot | null> {
    try {
      return (await this.api.snapshot(ref)).graph;
    } catch {
      return null;
    }
  }
}
