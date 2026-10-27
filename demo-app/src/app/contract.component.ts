import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';

/** Calls one endpoint whose response changes shape between calls (and once exceeds the capture limit). Only runs on click. */
@Component({
  selector: 'app-contract',
  template: `
    <button id="load-drift" (click)="drift()">Load drifting responses</button>
    <button id="load-big" (click)="big()">Load a huge response</button>
    <button id="load-xml" (click)="xml()">Load an XML response</button>
  `,
})
export class ContractComponent {
  private readonly http = inject(HttpClient);

  drift() {
    for (const id of [1, 2, 3]) this.http.get(`/api/drift/${id}`).subscribe();
  }

  big() {
    this.http.get('/api/drift/4').subscribe();
  }

  xml() {
    this.http.get('/api/legacy', { responseType: 'text' }).subscribe();
  }
}
