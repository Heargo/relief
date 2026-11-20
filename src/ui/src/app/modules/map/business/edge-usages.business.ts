import { computed, inject, Injectable, signal } from '@angular/core';

import type { EdgeUsagesResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';

export type UsagesStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

/** The usages, in the code, of the edge the inspector shows; fetched on demand. */
@Injectable()
export class EdgeUsagesBusiness {
  private readonly api = inject(ReliefApiService);

  private readonly _status = signal<UsagesStatus>('idle');
  private readonly _response = signal<EdgeUsagesResponse | null>(null);
  private requestId = 0;

  readonly status = this._status.asReadonly();
  readonly response = this._response.asReadonly();
  readonly visible = computed(() => this._status() !== 'idle');

  /** Loads the usages of an edge; a missing or failing API leaves the section out. */
  async load(from: string, to: string, side: 'base' | 'head'): Promise<void> {
    const request = ++this.requestId;
    this._response.set(null);
    this._status.set('loading');
    let response: EdgeUsagesResponse;
    try {
      response = await this.api.edgeUsages(from, to, side);
    } catch {
      if (request === this.requestId) this._status.set('idle');
      return;
    }
    if (request !== this.requestId) return;
    this._response.set(response);
    this._status.set(response.supported ? 'ready' : 'unsupported');
  }

  /** Forgets the usages (no edge selected). */
  clear(): void {
    this.requestId++;
    this._response.set(null);
    this._status.set('idle');
  }
}
