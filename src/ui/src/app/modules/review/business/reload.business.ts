import { inject, Injectable } from '@angular/core';

import { displayRef } from '../../map/helpers/repo.logic';
import { MapBusiness } from '../../map/business/map.business';
import { RepoBusiness } from '../../map/business/repo.business';
import { isReloadable } from '../helpers/reload.logic';
import { DiffBusiness } from './diff.business';
import { ReadingOrderBusiness } from './reading-order.business';

/** Reads the working tree again: the snapshot, the diff and the reading order of the current range. */
@Injectable()
export class ReloadBusiness {
  private readonly repo = inject(RepoBusiness);
  private readonly map = inject(MapBusiness);
  private readonly diff = inject(DiffBusiness);
  private readonly reading = inject(ReadingOrderBusiness);

  private running = false;

  canReload(): boolean {
    return isReloadable(this.diff.range());
  }

  async reload(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const range = this.diff.range();
      const ref = displayRef(range, this.repo.meta()?.branches ?? []);
      await this.repo.refreshSnapshot(ref);
      await this.diff.reload();
      await this.reading.load(range, this.diff.diff()?.diff.base, true);
      const snapshot = this.repo.snapshot();
      if (snapshot) this.map.show(this.diff.graphWithBase(snapshot.graph), true);
    } catch {
      // The next reload (button or focus) tries again; what is shown stays as it was.
    } finally {
      this.running = false;
    }
  }

  async onWindowFocus(): Promise<void> {
    if (this.canReload()) await this.reload();
  }
}
