import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';

/** Requests that go through the demo interceptors (auth header, cache, retry). Only runs on click. */
@Component({
  selector: 'app-interceptors',
  template: `
    <button id="load-profile" (click)="profile()">Load profile</button>
    <button id="load-unstable" (click)="unstable()">Load unstable</button>
  `,
})
export class InterceptorsComponent {
  private readonly http = inject(HttpClient);

  profile() {
    this.http.get('/api/profile').subscribe();
  }

  unstable() {
    this.http.get('/api/unstable', { params: { id: crypto.randomUUID() } }).subscribe();
  }
}
