import { inject, Injectable } from '@angular/core';

import { ReliefApiService } from '../services/relief-api.service';
import { LanguageBusiness } from './language.business';

@Injectable({ providedIn: 'root' })
export class DocsBusiness {
  private readonly api = inject(ReliefApiService);
  private readonly language = inject(LanguageBusiness);

  /** Opens the embedded user docs in the UI language. */
  async open(): Promise<void> {
    try {
      await this.api.openDocs(this.language.current());
    } catch (error) {
      console.error(error);
    }
  }
}
