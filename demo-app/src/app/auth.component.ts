import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';

const b64url = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeJwt = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.c2lnbmF0dXJl`;

/** Logs in for a JWT, then sends it as a Bearer header, in a query string, and as an already-expired token. Only runs on click. */
@Component({
  selector: 'app-auth',
  template: `
    <button id="login" (click)="login()">Log in</button>
    <button id="call-bearer" (click)="bearer()">Call with Bearer</button>
    <button id="call-query" (click)="query()">Call with ?token=</button>
    <button id="call-expired" (click)="expired()">Call with expired token</button>
  `,
})
export class AuthComponent {
  private readonly http = inject(HttpClient);
  private token = '';

  login() {
    this.http.post<{ access_token: string }>('/api/login', {}).subscribe((r) => (this.token = r.access_token));
  }

  bearer() {
    this.http.get('/api/me', { headers: { Authorization: `Bearer ${this.token}` } }).subscribe();
  }

  query() {
    this.http.get('/api/session', { params: { token: this.token } }).subscribe();
  }

  expired() {
    const token = makeJwt({ sub: 'ada', exp: Math.floor(Date.now() / 1000) - 3600 });
    this.http.get('/api/expired', { headers: { Authorization: `Bearer ${token}` } }).subscribe();
  }
}
