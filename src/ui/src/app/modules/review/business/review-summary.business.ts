import { inject, Injectable, PendingTasks, signal } from '@angular/core';

import type { ReviewSummary } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';

/** State of the structural overview of the range: loaded from `/api/review/summary`. */
@Injectable()
export class ReviewSummaryBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly pending = inject(PendingTasks);

  private readonly _summary = signal<ReviewSummary | null>(null);
  private token = 0;

  readonly summary = this._summary.asReadonly();

  /** Loads the overview of `range`; a failure leaves it empty (the diff panel shows errors). */
  async load(range: string | null): Promise<void> {
    const token = ++this.token;
    const done = this.pending.add();
    try {
      const summary = await this.api.reviewSummary(range);
      if (token === this.token) this._summary.set(summary);
    } catch {
      if (token === this.token) this._summary.set(null);
    } finally {
      done();
    }
  }
}
