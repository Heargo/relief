import { inject, Injectable, PendingTasks, signal } from '@angular/core';

import type { Rule } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';

/** State of the architecture rules of the range: loaded from the `rules` command. */
@Injectable()
export class RulesBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _rules = signal<Rule[]>([]);
  private readonly _source = signal<string | null>(null);
  private readonly _layer = signal(true);
  private token = 0;

  readonly rules = this._rules.asReadonly();
  /** Text of relief.config.yaml; null when the repository has none. */
  readonly source = this._source.asReadonly();
  /** The "Architecture rules" layer: violating edges and badges on the map. */
  readonly layer = this._layer.asReadonly();

  /** Loads the rules of `range`; a failure (no range, invalid file) leaves them empty. */
  async load(range: string | null): Promise<void> {
    const token = ++this.token;
    if (!range) {
      this._rules.set([]);
      this._source.set(null);
      return;
    }
    const done = this.pending.add();
    try {
      const response = await this.api.rules(range);
      if (token !== this.token) return;
      this._rules.set(response.rules);
      this._source.set(response.source ?? null);
    } catch {
      if (token !== this.token) return;
      this._rules.set([]);
      this._source.set(null);
    } finally {
      done();
    }
  }

  setLayer(on: boolean): void {
    this._layer.set(on);
  }
}
