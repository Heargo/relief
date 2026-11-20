import { inject, Injectable, signal } from '@angular/core';

import type { ImpactResponse } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import type { ImpactDirection } from '../helpers/impact.logic';

const HTTP_KEY = 'relief.impact.followHttp';
const MAX_DEPTH = 8;

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** State of the impact radius of the selected node. */
@Injectable()
export class ImpactBusiness {
  private readonly api = inject(ReliefApiService);

  private readonly _impact = signal<ImpactResponse | null>(null);
  private readonly _followHttp = signal(this.loadFollowHttp());
  private readonly _direction = signal<ImpactDirection>('callers');
  private readonly _layer = signal(true);
  private seed: string | null = null;
  private range: string | null = null;
  private token = 0;

  readonly impact = this._impact.asReadonly();
  readonly followHttp = this._followHttp.asReadonly();
  readonly direction = this._direction.asReadonly();
  /** The "impact radius" layer is shown. */
  readonly layer = this._layer.asReadonly();

  setLayer(on: boolean): void {
    this._layer.set(on);
    void this.reload();
  }

  toggleLayer(): void {
    this.setLayer(!this._layer());
  }

  setFollowHttp(value: boolean): void {
    this._followHttp.set(value);
    try {
      storage()?.setItem(HTTP_KEY, String(value));
    } catch {
      // The preference is only not remembered.
    }
    void this.reload();
  }

  setDirection(direction: ImpactDirection): void {
    this._direction.set(direction);
    void this.reload();
  }

  /** Loads the impact of `seed` (a node id), or clears it when `seed` is null. */
  async load(seed: string | null, range: string | null): Promise<void> {
    this.seed = seed;
    this.range = range;
    await this.reload();
  }

  private async reload(): Promise<void> {
    const token = ++this.token;
    if (!this.seed || !this._layer()) {
      this._impact.set(null);
      return;
    }
    try {
      const response = await this.api.impact(
        [this.seed],
        this._direction(),
        MAX_DEPTH,
        this._followHttp(),
        this.range,
      );
      if (token === this.token) this._impact.set(response);
    } catch {
      if (token === this.token) this._impact.set(null);
    }
  }

  private loadFollowHttp(): boolean {
    try {
      return storage()?.getItem(HTTP_KEY) !== 'false';
    } catch {
      return true;
    }
  }
}
