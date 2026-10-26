import { HttpClient } from '@angular/common/http';
import { Component, Injectable, inject } from '@angular/core';
import { retry } from 'rxjs';

/** Calls an endpoint that fails once per id, retrying at the service level. */
@Injectable({ providedIn: 'root' })
export class FlakyService {
  private readonly http = inject(HttpClient);

  load() {
    return this.http.get<{ ok: boolean }>('/api/flaky', { params: { id: crypto.randomUUID() } }).pipe(retry(2));
  }
}

/** Error scenarios: a Retry that recovers, and a plain failure. Only runs on click. */
@Component({
  selector: 'app-errors',
  template: `
    <button id="fire-flaky" (click)="flaky()">Load flaky (retry)</button>
    <button id="fire-error" (click)="error()">Load failing</button>
  `,
})
export class ErrorsComponent {
  private readonly http = inject(HttpClient);
  private readonly flakyService = inject(FlakyService);

  flaky() {
    this.flakyService.load().subscribe();
  }

  error() {
    this.http.get('/api/error').subscribe({ error: () => {} });
  }
}
