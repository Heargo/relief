import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideOptimus } from '@openng/optimus-ui/config';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { DialogService } from '@openng/optimus-ui/dynamicdialog';
import { firstValueFrom } from 'rxjs';
import { DocumentTitleService } from './core/services/document-title.service';
import { ReliefPreset } from './relief-preset';
import { routes } from './app.routes';
import { DEFAULT_LANGUAGE } from './core/constants/languages';
import { detectInitialLanguage } from './core/i18n/initial-language';
import { translateSettings } from './core/i18n/translate-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideTranslateService({
      ...translateSettings(detectInitialLanguage()),
      loader: provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json', failOnError: true }),
      retry: { count: 3, delay: (_error, attempt) => 300 * attempt },
    }),
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      return Promise.all([
        firstValueFrom(translate.use(detectInitialLanguage())),
        firstValueFrom(translate.setFallbackLang(DEFAULT_LANGUAGE)),
      ]);
    }),
    provideAppInitializer(() => {
      void inject(DocumentTitleService).init();
    }),
    MessageService,
    ConfirmationService,
    DialogService,
    provideOptimus({
      theme: { preset: ReliefPreset, options: { darkModeSelector: '.dark' } },
    }),
  ],
};
