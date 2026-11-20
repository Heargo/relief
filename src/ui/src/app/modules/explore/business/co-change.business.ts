import { inject, Injectable, PendingTasks, signal } from '@angular/core';

import type { CoChangePair } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';

/** State of the "Logical coupling" layer: the pairs of files changed together, asked when it is on. */
@Injectable()
export class CoChangeBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _pairs = signal<CoChangePair[]>([]);
  private readonly _layer = signal(false);
  private token = 0;

  readonly pairs = this._pairs.asReadonly();
  /** The layer: dashed edges between files that change together. Off by default. */
  readonly layer = this._layer.asReadonly();

  async load(ref: string | null): Promise<void> {
    const token = ++this.token;
    if (!ref) {
      this._pairs.set([]);
      return;
    }
    const done = this.pending.add();
    try {
      const response = await this.api.coChange(ref);
      if (token === this.token) this._pairs.set(response.pairs);
    } catch {
      if (token === this.token) this._pairs.set([]);
    } finally {
      done();
    }
  }

  setLayer(on: boolean): void {
    this._layer.set(on);
  }
}
