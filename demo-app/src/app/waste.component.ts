import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { Subject, switchMap } from 'rxjs';

/** Wasteful on purpose: a repeated GET, and a switchMap that cancels its own request. Only runs on click. */
@Component({
  selector: 'app-waste',
  template: `
    <button id="fire-duplicates" (click)="duplicates()">Fire duplicates</button>
    <button id="fire-cancel" (click)="cancel()">Fire cancelled search</button>
  `,
})
export class WasteComponent {
  private readonly http = inject(HttpClient);
  private readonly terms = new Subject<string>();

  constructor() {
    this.terms.pipe(switchMap((q) => this.http.get('/api/slow', { params: { q } }))).subscribe();
  }

  duplicates() {
    this.http.get('/api/products/1').subscribe();
    this.http.get('/api/products/1').subscribe();
  }

  cancel() {
    this.terms.next('a');
    this.terms.next('a');
  }
}
