import { computed, effect, inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  LanguageCode,
  SUPPORTED_LANGUAGES,
} from '../constants/languages';

@Injectable({ providedIn: 'root' })
export class LanguageBusiness {
  private readonly translate = inject(TranslateService);

  readonly languages = [...SUPPORTED_LANGUAGES];
  readonly current = computed<LanguageCode>(() => {
    const code = this.translate.currentLang();
    return this.languages.find((l) => l.code === code)?.code ?? DEFAULT_LANGUAGE;
  });

  constructor() {
    effect(() => {
      document.documentElement.lang = this.current();
    });
  }

  use(code: LanguageCode): void {
    this.translate.use(code);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // Storage unavailable: the choice is just not kept.
    }
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}
