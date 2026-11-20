import { inject, Injectable, PendingTasks, signal } from '@angular/core';

import type { Metrics } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';

/** State of the metrics of the displayed ref (churn, complexity, owner, tests) and of the risk layer. */
@Injectable()
export class RiskBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _metrics = signal<Record<string, Metrics>>({});
  private readonly _layer = signal(false);
  private token = 0;

  /** Node id to its metrics; empty until loaded, or when the command fails. */
  readonly metrics = this._metrics.asReadonly();
  /** The "Risk map" layer: the nodes tinted by risk. Off by default. */
  readonly layer = this._layer.asReadonly();

  async load(ref: string | null): Promise<void> {
    const token = ++this.token;
    if (!ref) {
      this._metrics.set({});
      return;
    }
    const done = this.pending.add();
    try {
      const response = await this.api.metrics(ref);
      if (token === this.token) this._metrics.set(response.nodes);
    } catch {
      if (token === this.token) this._metrics.set({});
    } finally {
      done();
    }
  }

  setLayer(on: boolean): void {
    this._layer.set(on);
  }
}
