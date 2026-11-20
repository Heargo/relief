import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { ReliefApiService } from './relief-api.service';

/** Puts the repository name in the window title. */
@Injectable({ providedIn: 'root' })
export class DocumentTitleService {
  private readonly api = inject(ReliefApiService);
  private readonly title = inject(Title);

  async init(): Promise<void> {
    try {
      const meta = await this.api.meta();
      this.title.setTitle(`${meta.repo} · relief`);
    } catch {
      // No API reachable: keep the default title.
    }
  }
}
