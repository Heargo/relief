import { computed, inject, Injectable, signal } from '@angular/core';

import type { RepoComparison } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { DiffBusiness } from '../../review/business/diff.business';
import type { ComparisonSide } from '../helpers/repo-comparisons.logic';
import { RepoBusiness } from './repo.business';

/** The side of a repository whose popover is open. */
export interface OpenComparison {
  name: string;
  side: ComparisonSide;
}

/** State of the menu "Comparisons per repository" of a workspace (the left panel). */
@Injectable()
export class RepoComparisonsBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly repo = inject(RepoBusiness);
  private readonly diff = inject(DiffBusiness);

  private readonly _menuOpen = signal(false);
  private readonly _comparisons = signal<RepoComparison[]>([]);
  private readonly _open = signal<OpenComparison | null>(null);
  private readonly _query = signal('');
  private readonly _error = signal<string | null>(null);

  readonly menuOpen = this._menuOpen.asReadonly();
  readonly comparisons = this._comparisons.asReadonly();
  readonly open = this._open.asReadonly();
  readonly query = this._query.asReadonly();
  readonly error = this._error.asReadonly();
  /** The button is offered on a workspace only. */
  readonly available = computed(() => !!this.repo.meta()?.workspace);

  async openMenu(): Promise<void> {
    this._error.set(null);
    try {
      this._comparisons.set(await this.api.workspaceComparisons());
      this._menuOpen.set(true);
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));
    }
  }

  back(): void {
    this._open.set(null);
    this._menuOpen.set(false);
  }

  openSide(name: string, side: ComparisonSide): void {
    const current = this._open();
    if (current?.name === name && current.side === side) return this.close();
    this._open.set({ name, side });
    this._query.set('');
  }

  close(): void {
    this._open.set(null);
  }

  setQuery(query: string): void {
    this._query.set(query);
  }

  /** Sets one side of a repository for the session, then reads the map and the diff again. */
  async pick(value: string): Promise<void> {
    const open = this._open();
    const current = this._comparisons().find((c) => c.name === open?.name);
    if (!open || !current) return;
    this.close();
    const source = open.side === 'source' ? value : current.source;
    const destination = open.side === 'destination' ? value : current.destination;
    await this.change(current.name, source, destination, false);
  }

  /** Keeps the comparison of a repository in the workspace file. */
  async saveDefault(name: string): Promise<void> {
    const current = this._comparisons().find((c) => c.name === name);
    if (current) await this.change(name, current.source, current.destination, true);
  }

  private async change(
    name: string,
    source: string,
    destination: string,
    save: boolean,
  ): Promise<void> {
    this._error.set(null);
    try {
      this._comparisons.set(await this.api.setRepoComparison(name, source, destination, save));
      const ref = this.repo.ref();
      if (ref) await this.repo.refreshSnapshot(ref);
      await this.diff.reload();
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
