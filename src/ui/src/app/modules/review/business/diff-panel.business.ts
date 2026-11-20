import { inject, Injectable, PendingTasks, signal } from '@angular/core';

import type { DiffResponse, NodeChange } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import { baseNodeId, fileSymbolChanges } from '../helpers/diff-panel.logic';

/** The code of a node on both sides; a side is null when the node does not exist there. */
export interface DiffBlock {
  nodeId: string;
  status: NodeChange['status'];
  change: NodeChange | null;
  base: string | null;
  head: string | null;
}

/** State of the structural diff panel: the code read for the range chosen. */
@Injectable()
export class DiffPanelBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _blocks = signal<DiffBlock[]>([]);
  private readonly _error = signal<string | null>(null);
  private token = 0;

  readonly blocks = this._blocks.asReadonly();
  readonly error = this._error.asReadonly();

  /** Reads the code of a symbol, or of every changed symbol of a file (the whole file when none changed). */
  async show(nodeId: string, diff: DiffResponse, range: string | null): Promise<void> {
    // Pending task: the page is stable (tests, prerender) once the code is read.
    const done = this.pending.add();
    try {
      await this.load(nodeId, diff, range);
    } finally {
      done();
    }
  }

  private async load(nodeId: string, diff: DiffResponse, range: string | null): Promise<void> {
    const token = ++this.token;
    this._error.set(null);
    try {
      const blocks = await this.read(nodeId, diff, range);
      if (token === this.token) this._blocks.set(blocks);
    } catch (error) {
      if (token !== this.token) return;
      this._blocks.set([]);
      this._error.set(error instanceof Error ? error.message : String(error));
    }
  }

  private async read(
    nodeId: string,
    diff: DiffResponse,
    range: string | null,
  ): Promise<DiffBlock[]> {
    const symbols = nodeId.includes('::sym:')
      ? diff.diff.nodes.filter((c) => c.id === nodeId)
      : fileSymbolChanges(nodeId, diff);
    if (symbols.length === 0) {
      const [base, head] = await Promise.all([
        this.side(nodeId, 'base', range),
        this.side(nodeId, 'head', range),
      ]);
      return [{ nodeId, status: 'modified', change: null, base, head }];
    }
    return Promise.all(
      symbols.map(async (change) => {
        const [base, head] = await Promise.all([
          change.status === 'added'
            ? null
            : this.api.code(baseNodeId(change.id, diff), 'base', range),
          change.status === 'removed' ? null : this.api.code(change.id, 'head', range),
        ]);
        return { nodeId: change.id, status: change.status, change, base, head };
      }),
    );
  }

  /** A whole file may not exist on one side (added or removed file). */
  private async side(id: string, side: 'base' | 'head', range: string | null) {
    try {
      return await this.api.code(id, side, range);
    } catch {
      return null;
    }
  }
}
