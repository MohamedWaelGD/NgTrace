import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './api.service';
import { routes } from './app.routes';
import { changeDetection } from './change-detection';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    changeDetection,
    provideRouter(routes),
    provideHttpClient(),
    provideAppInitializer(() => {
      const config = inject(ConfigService);
      return firstValueFrom(config.load()).then((c) => (config.config = c));
    }),
  ],
};
